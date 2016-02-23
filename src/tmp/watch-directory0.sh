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

  CHANGES=`find "${HOME_DIR}" -newer "${TIMESTAMP_FILE}"`

  IFS=$'\n' read -rd '' -a CHANGES_ARRAY <<<"${CHANGES}"

  if [[ "${CHANGES}" ]] ; then
    CHANGES_META=""
    for CHANGE in "${CHANGES_ARRAY[@]}"
    do

      if [[ ${OSTYPE} =~ ^darwin ]]; then
        CMD=`ls -dilaT "${CHANGE}"`
        CHANGES_META="${CMD} ${CHANGES_META}"
      else
        CMD=`ls --full-time "${CHANGE}"`
        CHANGES_META="${CMD} ${CHANGES_META}"
      fi
    done

    #CHANGES_META=`ls -dilaT "${CHANGES}"`

    # echo "changesMeta: ${CHANGES}"
    # echo "changesMeta: ${CHANGES_META}"

    if [[ "${CHANGES_META}" != "${LAST_CHANGES}" ]] ; then

      #IFS=$'\n' read -rd '' -a CHANGES_ARRAY <<<"${CHANGES}"
      IFS=$'\n' read -rd '' -a CHANGES_META_ARRAY <<<"${CHANGES_META}"
      IFS=$'\n' read -rd '' -a LAST_CHANGES_ARRAY <<<"${LAST_CHANGES}"

      INDEX=0
      for META in "${CHANGES_META_ARRAY[@]}"
      do
        if [[ " ${LAST_CHANGES_ARRAY[@]} " =~ " ${META} " ]]; then
          # nothing
            echo "" &>/dev/null
        else
            FILE=${CHANGES_ARRAY[INDEX]}
            if [[ -d "${FILE}" ]]; then
              TYPE="d"
            else
              TYPE="f"
            fi

            INODE=`printf "${META}" | cut -d' ' -f1`
            echo "${INODE} ${TYPE} ${FILE}"
        fi
      INDEX=$INDEX+1
      done
    fi
  fi

  LAST_CHANGES="${CHANGES_META}"
  sleep ${INTERVAL_SECS}
  #echo "new interation"

done
