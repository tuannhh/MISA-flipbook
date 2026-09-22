# Backup and restore runbook

Run these scripts from Git Bash, WSL, or another Bash environment on the Docker host. They use `docker cp` rather than host-volume bind mounts, so they do not depend on `cygpath` and work consistently on Windows and Linux.

Create a coherent backup:

```bash
bash ./backup.sh --quiesce --output /safe/backup/location
```

`--quiesce` stops only API, dispatcher, conversion worker and PDF worker while the PostgreSQL custom dump and storage archive are captured. It restarts exactly the services that had been running. Verify `SHA256SUMS`, copy the complete timestamped folder to separate storage, and periodically exercise the restore procedure in an isolated Compose project.

Restore is destructive and is intended for an isolated drill stack or scheduled maintenance window only:

```bash
bash ./restore.sh --input /safe/backup/location/20260921-120000 --confirm-restore
```

The confirmation flag is required because the command replaces the current database objects and storage-volume contents. It verifies the recorded SHA-256 checksums before making changes.
