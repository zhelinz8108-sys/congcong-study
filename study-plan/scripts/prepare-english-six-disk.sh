#!/usr/bin/env bash
set -euo pipefail

disk=/dev/disk/by-id/virtio-disk-83tyeidr
target=/www/study-plan-data
expected_bytes=53687091200

test -b "$disk"
test "$(sudo blockdev --getsize64 "$disk")" = "$expected_bytes"
test "$(lsblk -dn -o SERIAL "$disk" | xargs)" = disk-83tyeidr
test "$(lsblk -nr -o NAME "$disk" | wc -l)" = 1

fstype=$(lsblk -dn -o FSTYPE "$disk" | xargs)
if [ -z "$fstype" ]; then
  test -z "$(sudo wipefs -n --noheadings "$disk")"
  test -z "$(lsblk -dn -o MOUNTPOINTS "$disk" | xargs)"
  sudo mkfs.ext4 -m 1 -L congcong-data "$disk"
elif [ "$fstype" != ext4 ]; then
  printf 'Unexpected filesystem: %s\n' "$fstype" >&2
  exit 1
fi

uuid=$(sudo blkid -s UUID -o value "$disk")
test -n "$uuid"
sudo install -d -m 755 "$target"
if ! grep -q "^UUID=$uuid " /etc/fstab; then
  sudo cp -n -p /etc/fstab /etc/fstab.congcong-before-english-six-20261011
  printf 'UUID=%s %s ext4 defaults,noatime,nofail 0 2\n' "$uuid" "$target" | sudo tee -a /etc/fstab
fi
if ! mountpoint -q "$target"; then
  sudo mount "$target"
fi
test "$(findmnt -no UUID "$target")" = "$uuid"
sudo chown ubuntu:ubuntu "$target"
install -d -m 755 "$target/english-six" "$target/english-six/assets" "$target/english-six/resources" "$target/english-six/practice"
df -h "$target"
findmnt "$target"
