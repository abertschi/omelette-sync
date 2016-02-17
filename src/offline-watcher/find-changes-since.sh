#!/bin/bash

# script.sh /absolute/basedir 10000
# $1: base directory
# $2: time to look back in seconds to detect file changes

HOME_DIR="$1"
CTIME="-$2s"

# format: 30725184 ./node_modules/core-js/library/fn/regexp/

find $HOME_DIR -ctime $CTIME | xargs -I {} ls -Fd {} | xargs -I {} stat {} | cut -d'"' -f 1,9 | cut -d' ' -f 2,13-
