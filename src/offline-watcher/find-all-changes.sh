#!/bin/bash

HOME_DIR="$1"

# format: 30725184 ./node_modules/core-js/library/fn/regexp/

find $HOME_DIR | xargs -I {} ls -Fd {} | xargs -I {} stat {} | cut -d'"' -f 1,9 | cut -d' ' -f 2,13-
