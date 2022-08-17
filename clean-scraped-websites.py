#!/usr/bin/env python

"""
Clean the most common websites from the list of detected websites
You are supposed to run this script after the scraping of the websites 
 and before the scraping of the VPM pages
 
First, it adds the domains that appear more than 20 times to a file 
 that collects these common domains from previous scrapings
Then, it removes the domains listed in the file from the results

Author: Carlo Bottai
Copyright (c) 2020 - TU/e and EPFL
License: See the LICENSE file.
Date: 2020-10-15

"""


# TODO
# This version of the code has a potentially significant limitation. It 
#  excludes websites like google.com, apple.com This is desirable in most cases,
#  but not for the true case; i.e., Google or Apple in the examples.
#  On the other hand it is also true that is unlikely to find any VPM page 
#  into these domains, since many of these big companies will have 
#  a separate domain for their VPM, if any exists


import json
from datetime import datetime
from iris_utils.parse_args import parse_io


def main():
    args = parse_io()
    
    with open(args.input_list[0], 'r') as f_in:
        data = [json.loads(line) for line in f_in.read().splitlines()]
    
    all_websites = [url for line in data \
        for url in line['scraped_websites']]
    all_websites = ['.'.join(url.split('.')[-2:]) \
        for url in all_websites if url is not None]
    all_websites = [domain \
        for domain in all_websites if len(domain.split('.')[0])>2]
    all_websites_freq = {i:all_websites.count(i) for i in set(all_websites)}
    # TODO: generalize next line using an argument for the threshold
    exclude_websites = [k for k,v in all_websites_freq.items() if v>=10]
    
    f_out_name = args.input_list[1].split('.')[-2:-1][0]
    now = datetime.now().strftime('%H%M%y%m%d')
    with open(args.input_list[1], 'a') as f_out, \
         open(args.input_list[1], 'r') as f_in, \
         open(f'{f_out_name}_{now}.txt', 'w') as f_bak:
        websites_already_in_file = f_in.read()
        f_bak.write(websites_already_in_file)
        websites_already_in_file = websites_already_in_file.splitlines()
        exclude_websites_to_add = [exclude_website \
            for exclude_website in exclude_websites if \
            exclude_website is not None and \
            exclude_website not in websites_already_in_file and \
            not exclude_website.replace('.','').isnumeric()]
        for website in exclude_websites_to_add:
          add = input(f'Add {website} to the list of excluded websites? [y]/n ')
          if add=='' or add=='y':
              f_out.write(f'{website}\n')
    
    with open(args.input_list[1], 'r') as f_in:
        exclude_websites = f_in.read().splitlines()
    
    # for line in data:
    #     line['scraped_websites'] = [website \
    #         for website in line['scraped_websites'] if \
    #         website is not None and \
    #         not any([website.endswith(end) \
    #             for end in ['.gov','.edu','.mil','.int']]) and \
    #         '.'.join(website.split('.')[-2:]) not in exclude_websites and \
    #         not any([website.find(exclude_website)>=0 \
    #             for exclude_website in exclude_websites]) and \
    #         not website.replace('.','').isnumeric()]
    #     if len(line['scraped_websites'])==0:
    #         line['scraped_websites'] = [None]

    for line in data:
        line['scraped_websites'] = [website \
            for website in line['scraped_websites'] if \
            website is not None and \
            not any([website.endswith(end) \
                for end in ['.gov','.edu','.mil','.int']]) and \
            '.'.join(website.split('.')[-2:]) not in exclude_websites and \
            not website.replace('.','').isnumeric()]
        for website in line['scraped_websites']:
            to_exclude = False
            for exclude_website in exclude_websites:
                exclude_website_len = len(exclude_website.split('.'))
                # FIXME Why lens.org has not been removed? I think that this is not working properly because you can have cases like http://www.foo.com/web_page that are not excluded by foo.com (even though in theory you should have only foo.com in the webpages extracted, without the pages)
                if '.'.join(website.split('.')[-exclude_website_len:])==exclude_website:
                    to_exclude = True
            if to_exclude==True:
                line['scraped_websites'] = [ws for ws in line['scraped_websites'] if ws!=website]
        if len(line['scraped_websites'])==0:
            line['scraped_websites'] = [None]
    
    with open(args.output, 'w') as f_out:
        for line_data in data:
            json.dump(line_data, f_out, separators=(',',':'))
            f_out.write('\n')


if __name__ == '__main__':
    main()
