#!/bin/bash

#
# script.sh path [interval] [lookback]
#
# parms:
#  - path: path to watch for changes
#  - interval: interval in seconds to watch for changes, optional
#  - lookback: seconds to loockback for changes, optional
#
# output:
# 31743194 d ../../../encryption-nodejs/src/watcher2
#

if [ "$1" = "" ] ; then
  echo "Directory not set" >&2
  exit 1
else
  HOME_DIR="$1"
fi

if [ "$2" = "" ] ; then
  INTERVAL_SECS=1
else
  INTERVAL_SECS="$2"
fi

if [ "$3" = "" ] ; then
  LOOKBACK_SECONDS=120
else
  LOOKBACK_SECONDS="$3"
fi

TIMESTAMP_FILE="/tmp/watcher-ts"
LAST_CHANGES=""

while [[ true ]] ; do

  if [[ ${OSTYPE} =~ ^darwin ]]; then
    TIMESTAMP=`date +%s`
    TIMESTAMP=$(( ${TIMESTAMP} - ${LOOKBACK_SECONDS} ))
    TIMESTAMP=`date -r ${TIMESTAMP} +%m%d%H%M.%S`
  else
    TIMESTAMP=`date -d "-${LOOKBACK_SECONDS} sec" +%m%d%H%M.%S`
  fi

  # Create or update the reference timestamp file.
  touch -t ${TIMESTAMP} "${TIMESTAMP_FILE}"

  CHANGES=`find "${HOME_DIR}" -cnewer "${TIMESTAMP_FILE}"`

  if [[ "${CHANGES}" ]] ; then

    # if [[ ${OSTYPE} =~ ^darwin ]]; then
    #   CHANGES=`stat ${CHANGES}`
    # else
    #   CHANGES=`ls --full-time ${CHANGES}`
    # fi

    IFS=$'\n' read -rd '' -a CHANGES_ARRAY <<<"${CHANGES}"
    INDEX=0
    META_ARRAY=""
    for CHANGE in "${CHANGES_ARRAY[@]}" ; do

      META_ARRAY[INDEX]=`ls -dilaT "${CHANGE}"`
    ((INDEX++))
    done

    if [[ "${META_ARRAY[@]}" != "${LAST_CHANGES[@]}" ]] ; then
      LENGTH=${#META_ARRAY[@]}

      for (( i=0; i<${LENGTH}; i++ )); do
        META=${META_ARRAY[$i]}

        if [[ " ${LAST_CHANGES[@]} " =~ " ${META} " ]]; then
            # nothing
            echo "" &>/dev/null
        else
            FILE=${CHANGES_ARRAY[i]}
            if [[ -d "${FILE}" ]]; then
              TYPE="d"
            else
              TYPE="f"
            fi

            INODE=`printf "${META}" | cut -d' ' -f1`
            echo "${INODE} ${TYPE} ${FILE}"
        fi
      done
    fi
    LAST_CHANGES=("${META_ARRAY[@]}")
  fi

  sleep ${INTERVAL_SECS}
done
