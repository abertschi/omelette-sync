#!/bin/bash

HOME_DIR="$1"

# format: {f|d} 30725184 ./node_modules/core-js/library/fn/regexp/

find $HOME_DIR |
{
while read FILE; do

  STATS=`stat "${FILE}" | cut -d'"' -f 1,9 | cut -d' ' -f 2,13-`

  if [[ -d "${FILE}" ]]; then
    TYPE="d"
  else
    TYPE="f"
  fi

  echo "${TYPE} ${STATS}"

done
}


# find $HOME_DIR | xargs -I {} stat {} | cut -d'"' -f 1,9 | cut -d' ' -f 2,13-
