"""Synthetic webpack trees only: no production paths, processes, or network."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "unused_webpack_fixture", Path(__file__).with_name("cleanup-unused-webpack-cache.py")
)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class Fixture:
    def __init__(self, directory):
        self.root = Path(directory)
        self.target = self.root / ".next/cache/webpack"
        self.target.mkdir(parents=True)
        (self.target / "client").mkdir()
        (self.target / "client/0.pack").write_bytes(b"rebuildable compiler cache" * 500)
        (self.target / "index.pack").write_bytes(b"index" * 1000)
        self.retained = {
            ".next/server/app.js": b"running server",
            ".next/static/chunk.js": b"runtime static asset",
            ".next/BUILD_ID": b"deployed-build",
            "uploads/lesson.pdf": b"uploaded lesson",
            "data/learning-records.json": b"learning records",
            "backups/rollback.tar.gz": b"retained rollback",
            ".next/cache/retained.txt": b"other cache must remain",
        }
        for name, contents in self.retained.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)

    def clean(self, **options):
        return helper.cleanup_cache(
            self.target, owners=frozenset({
                0, os.getuid(), Path("/").stat().st_uid,
                Path(tempfile.gettempdir()).stat().st_uid,
            }),
            busy=options.pop("busy", lambda unused: False), **options
        )

    def assert_retained(self, test):
        for name, contents in self.retained.items():
            test.assertEqual((self.root / name).read_bytes(), contents)

    def allocated(self):
        return sum(path.stat().st_blocks * 512 for path in
                   [self.target, *self.target.rglob("*")])


class CleanupTests(unittest.TestCase):
    def fixture(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        return Fixture(folder.name)

    def test_only_compiler_cache_is_removed_and_repeated_run_is_safe(self):
        fixture = self.fixture()
        allocated = fixture.allocated()
        result = fixture.clean()
        self.assertTrue(result["cacheRemoved"])
        self.assertGreater(result["releasedBytes"], 0)
        self.assertLessEqual(result["releasedBytes"], allocated)
        self.assertFalse(fixture.target.exists())
        fixture.assert_retained(self)
        self.assertEqual(fixture.clean(), {"releasedBytes": 0, "cacheRemoved": False})
        fixture.assert_retained(self)

    def test_symlink_file_is_rejected_and_destination_is_preserved(self):
        fixture = self.fixture()
        outside = fixture.root / "uploads/lesson.pdf"
        (fixture.target / "unsafe.pack").symlink_to(outside)
        with self.assertRaises((helper.CleanupError, OSError)):
            fixture.clean()
        self.assertTrue((fixture.target / "unsafe.pack").is_symlink())
        self.assertTrue((fixture.target / "index.pack").exists())
        fixture.assert_retained(self)

    def test_symlink_parent_is_rejected_without_following_it(self):
        fixture = self.fixture()
        actual = fixture.root / "actual-cache"
        (fixture.root / ".next/cache").rename(actual)
        (fixture.root / ".next/cache").symlink_to(actual, target_is_directory=True)
        with self.assertRaises((helper.CleanupError, OSError)):
            fixture.clean()
        self.assertTrue((actual / "webpack/index.pack").is_file())
        fixture.assert_retained(self)

    def test_symlink_target_is_rejected(self):
        fixture = self.fixture()
        actual = fixture.root / "kept-webpack"
        fixture.target.rename(actual)
        fixture.target.symlink_to(actual, target_is_directory=True)
        with self.assertRaises((helper.CleanupError, OSError)):
            fixture.clean()
        self.assertTrue((actual / "index.pack").is_file())
        self.assertTrue(fixture.target.is_symlink())

    def test_special_file_is_rejected_without_blocking(self):
        fixture = self.fixture()
        special = fixture.target / "special.pack"
        os.mkfifo(special)
        with self.assertRaises((helper.CleanupError, OSError)):
            fixture.clean()
        self.assertTrue(special.exists())
        self.assertTrue((fixture.target / "index.pack").exists())
        fixture.assert_retained(self)

    def test_unexpected_owner_is_rejected(self):
        fixture = self.fixture()
        with self.assertRaises((helper.CleanupError, OSError)):
            helper.cleanup_cache(fixture.target, owners=frozenset({os.getuid() + 20001}),
                                 busy=lambda unused: False)
        self.assertTrue((fixture.target / "index.pack").exists())
        fixture.assert_retained(self)

    def test_busy_before_rename_preserves_original(self):
        fixture = self.fixture()
        with self.assertRaises(helper.CleanupError):
            fixture.clean(busy=lambda unused: True)
        self.assertTrue((fixture.target / "index.pack").exists())
        self.assertFalse((fixture.target.parent / ".webpack-unused-c64-cleanup").exists())
        fixture.assert_retained(self)

    def test_busy_after_rename_restores_original_name(self):
        fixture = self.fixture()
        calls = []

        def busy(path):
            calls.append(path)
            return len(calls) > 1

        with self.assertRaises(helper.CleanupError):
            fixture.clean(busy=busy)
        self.assertGreaterEqual(len(calls), 2)
        self.assertTrue((fixture.target / "index.pack").exists())
        self.assertFalse((fixture.target.parent / ".webpack-unused-c64-cleanup").exists())
        fixture.assert_retained(self)

    def test_directory_replacement_before_rename_preserves_both_trees(self):
        fixture = self.fixture()
        original = fixture.target.parent / "concurrent-original"

        def replace():
            fixture.target.rename(original)
            fixture.target.mkdir()
            (fixture.target / "replacement.pack").write_bytes(b"concurrent replacement")

        with self.assertRaises(helper.CleanupError):
            fixture.clean(before_rename=replace)
        self.assertTrue((original / "index.pack").is_file())
        self.assertEqual((fixture.target / "replacement.pack").read_bytes(),
                         b"concurrent replacement")
        fixture.assert_retained(self)

    def test_tree_change_before_rename_is_rejected(self):
        fixture = self.fixture()

        def change():
            (fixture.target / "new.pack").write_bytes(b"concurrent write")

        with self.assertRaises(helper.CleanupError):
            fixture.clean(before_rename=change)
        self.assertEqual((fixture.target / "new.pack").read_bytes(), b"concurrent write")
        self.assertTrue((fixture.target / "index.pack").exists())
        fixture.assert_retained(self)

    def test_cache_over_limit_is_rejected_before_deletion(self):
        fixture = self.fixture()
        with self.assertRaises(helper.CleanupError):
            fixture.clean(maximum=1)
        self.assertTrue((fixture.target / "index.pack").exists())
        fixture.assert_retained(self)

    def test_path_without_exact_cache_suffix_is_rejected(self):
        fixture = self.fixture()
        with self.assertRaises(helper.CleanupError):
            helper.cleanup_cache(fixture.root / "uploads", busy=lambda unused: False)
        fixture.assert_retained(self)


class RecoveryTests(unittest.TestCase):
    def test_sufficient_capacity_does_not_call_cleanup(self):
        def forbidden(*arguments, **options):
            self.fail("sufficient capacity must not inspect or clean a cache")

        helper.recover([Path("/synthetic/must-not-be-opened")],
                       available=lambda: 200, worker_present=lambda: True,
                       target_free=200, cleanup=forbidden)

    def test_missing_worker_does_not_call_cleanup(self):
        def forbidden(*arguments, **options):
            self.fail("absent deployment worker must not clean a cache")

        helper.recover([Path("/synthetic/must-not-be-opened")],
                       available=lambda: 100, worker_present=lambda: False,
                       target_free=200, cleanup=forbidden)

    def test_candidates_remain_ordered_and_stop_at_required_capacity(self):
        calls = []
        candidates = [Path("first"), Path("second"), Path("third")]

        def cleanup(path, **options):
            calls.append(path)
            return {"releasedBytes": 25, "cacheRemoved": True}

        helper.recover(candidates, available=lambda: 100 + 25 * len(calls),
                       worker_present=lambda: True, target_free=150, cleanup=cleanup)
        self.assertEqual(calls, candidates[:2])

    def test_total_cleanup_budget_is_passed_to_each_candidate(self):
        attempts = []
        released = []

        def cleanup(path, maximum, **options):
            attempts.append((path, maximum))
            size = 7 if path == Path("first") else 6
            if size > maximum:
                raise helper.CleanupError("synthetic cache exceeds remaining budget")
            released.append(size)
            return {"releasedBytes": size, "cacheRemoved": True}

        try:
            helper.recover([Path("first"), Path("second")], available=lambda: 100,
                           worker_present=lambda: True, target_free=1000,
                           maximum=10, cleanup=cleanup)
        except helper.CleanupError:
            pass
        self.assertEqual(attempts, [(Path("first"), 10), (Path("second"), 3)])
        self.assertEqual(sum(released), 7)

    def test_worker_disappearing_after_first_cache_stops_cleanup(self):
        calls = []

        def cleanup(path, **options):
            calls.append(path)
            return {"releasedBytes": 1, "cacheRemoved": True}

        helper.recover([Path("first"), Path("second")], available=lambda: 100,
                       worker_present=lambda: not calls, target_free=200, cleanup=cleanup)
        self.assertEqual(calls, [Path("first")])


if __name__ == "__main__":
    unittest.main(verbosity=2)
