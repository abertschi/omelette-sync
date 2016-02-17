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
# 16777220 30684194 drwxr-xr-x 14 abertschi staff 0 476 "Feb 17 16:08:32 2016" "Feb 17 16:07:43 2016" "Feb 17 16:07:43 2016" "Feb 12 21:30:17 2016" 4096 0 0 ./../..//.git
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

  CHANGES=`find "${HOME_DIR}" -newer "${TIMESTAMP_FILE}" | xargs -I {} ls -Fd {}`

  if [[ "${CHANGES}" ]] ; then
    if [[ ${OSTYPE} =~ ^darwin ]]; then
      CHANGES=`stat ${CHANGES}`
    else
      CHANGES=`ls --full-time ${CHANGES}`
    fi

    if [[ "${CHANGES}" != "${LAST_CHANGES}" ]] ; then

      IFS=$'\n' read -rd '' -a CHANGES_ARRAY <<<"${CHANGES}"
      IFS=$'\n' read -rd '' -a LAST_CHANGES_ARRAY <<<"${LAST_CHANGES}"

      for CHANGE in "${CHANGES_ARRAY[@]}"
      do
        if [[ " ${LAST_CHANGES_ARRAY[@]} " =~ " ${CHANGE} " ]]; then
          # nothing
            echo "" &>/dev/null
        else
            echo "${CHANGE}"
        fi
      done
    fi
  fi

  LAST_CHANGES="${CHANGES}"
  sleep ${INTERVAL_SECS}
  #echo "new interation"

done
