# Archive Directory

This directory contains backup and snapshot files that have been removed from the main codebase.

## Backup Files

- `backup-files/` - Contains `.backup` files from development

## Restoration

To restore a backup file:
1. Copy the file from this archive back to its original location
2. Remove the `.backup` extension
3. Review changes before committing

## Git Archive (Recommended)

For a proper git-based archive, create a branch:
```bash
git checkout -b archive/backup-files
git add .archive/
git commit -m "Archive backup files"
git checkout main
# Then remove backup files from main branch
```

