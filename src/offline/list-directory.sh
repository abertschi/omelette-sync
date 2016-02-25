DIRECTORY="$1"

find "${DIRECTORY}" -maxdepth 1 |
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

# output 16894279 .nvm/
