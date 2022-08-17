#!/bin/bash

while getopts ":i:" opt; do
  case $opt in
    i) p_in="$OPTARG"
    ;;
    \?) echo "Invalid option -$OPTARG" >&2
    ;;
  esac
done

now=`date +%y%m%d%H%M%S`

p_bak="$(cut -d'.' -f1 <<<"$p_in")"
p_bak="${p_bak}_${now}.json"

cp $p_in $p_bak

cat $p_bak | jq -cs '.[] | select(.scraped_websites!=["ERROR"])' > $p_in

cmp --silent $p_in $p_bak || exit 1
