#!/bin/bash

now=`date +%d/%m/%Y`
now+=" "
now+=`date +%H:%M:%S`

case "$1" in
	website)
		f_in=./data/data_from_database/data.jsonl
		f_out=./data/data_from_websites_scraper/results.jsonl
		;;
		
	vpm)
		f_in=./data/data_from_websites_scraper/results_clean.jsonl
		f_out=./data/data_from_vpm-pages_scraper/results.jsonl
		;;
esac

n_in=$(wc -l < $f_in)
n_out=$(wc -l < $f_out)
n_error=$(grep ERROR $f_out | wc -l)
n_out=$(($n_out-$n_error))
n_out_p=$(($n_out*100/$n_in))

echo $now
echo "$n_out lines already scraped ($n_out_p% of the total)"
echo "$n_error ERRORs made (not counted in previous information)"
