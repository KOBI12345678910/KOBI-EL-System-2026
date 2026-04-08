#!/bin/bash
git pull github main --strategy-option theirs
echo "Synced from GitHub at $(date)"
