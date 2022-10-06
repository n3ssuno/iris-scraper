# IRIS websites scraper
Scraper for the IRIS project to run using a [Rasperry Pi (RPi)](https://www.raspberrypi.org/).

## Reproducibility
To reproduce the results, please follow these steps [1]

1. Install [Rasperry Pi OS](https://www.raspberrypi.org/downloads/)
2. Install [Git](https://git-scm.com/) running ``sudo apt install -y git jq``
3. Clone this repository
    * ``cd ~/Documents``
    * ``git clone https://github.com/n3ssuno/iris-scraper.git``
    * ``cd iris-scraper``
4. Install [Node.js](https://nodejs.org/)
    * If you are using a RPi Zero or a RPi 1 (i.e., a device with a ARMv6 architecture) use the following script (be aware that the support for this architecture is experimental)
        * ``sudo ./install-nodejs-12-rpi_zero.sh``
    * Otherwise, run the following commands
        * ``curl -sL https://deb.nodesource.com/setup_12.x | sudo bash -``
        * ``sudo apt-get install -y nodejs``
5. Install the needed node.js packages with ``npm install``
6. Add a ``data.jsonl`` file with the information to scrape the ``data/data_from_database/`` folder
7. Create a new daemon that manages the scraping script
    * ``sudo cp iris-scraper@.service /etc/systemd/system/``

If needed, you can add ``iris_utils`` as a submodule with (this should be already in place after point 2 above):
* ``git submodule add https://github.com/n3ssuno/iris-utils.git iris_utils``
* ``git commit -m "Add iris-utils submodule"``
* ``git push``

[1] Note that, for this part of the IRIS project, the results cannot be perfectly reproduced, since they depend on many factors, some of which random and/or time-evolving.

### Possible types of scraper
* Websites scrapers (first phase) [2]
    * choose ``website`` to use only Bloomberg and the Google front-page;
    * choose ``website_sbir`` to use also SBIR as a scraping source;
* VPM pages scrapers (second phase)
    * choose ``vpm`` to use Google to search the patent numbers within the detected websites

The websites scrapers, for each recipient/assignee name listed in ``data/data_from_database/data.jsonl``, search for its website on
* The SBIR website (not mandatory)
* Bloomberg
* Google (first page; about 10 results)

The results are listed in the ``data/data_from_websites_scraper/results.jsonl`` file.

Instead, the VPM pages scraper uses the websites previously detected and ask Google to search for the related patent numbers within them. The number of results scraped are no more than the number of websites times the number of patents.

[2] The idea is that only if you are actually looking for the name of recipients of the SBIR program it makes sense to look on the SBIR website for the websites of these recipients.

## Scrapers configuration
The scrapers can be fine-tuned through some parameters that you can modify in the ``scraper.conf`` file. Specifically
* ``SCRAPING_RATE`` controls the target rate (in seconds) at which the scraper should go (default ``120``). If the scraper takes less than the target, it will wait for longer. If it takes more, it will try to compensate in the following rounds (since this is the average target and not the punctual target).
* ``USE_HEADLESS`` controls if the scraper should not show the browser (default ``true``)
* ``USE_MOBILE`` controls if the scraper should simulate a mobile environment or not (default ``true``)
* ``CHROME_PATH`` contains the path to the Chromium/Chorme browser in your system (default ``null``). If it is ``null``, the script will try to guess the path in the following preferential order
    * if your OS is perceived as MS Windows by Python, the script will use the executable file found at ``C:\Program Files (x86)\Google\Chrome\Application\chrome.exe``;
    * otherwise, the executable at ``/usr/bin/google-chrome-stable`` will be used, if present;
    * or ``/usr/bin/chromium-browser`` will be used (if this file is not present, an error will be raised by the scraper).

## Scraping phases
1. The first thing to do is to search for the website of the US Federal funds recipients and/or USPTO patent assignees, with the following commands (where ``<scraper-type>`` is the type of scraper you want to use; see below)
    * ``sudo systemctl enable iris-scraper@<scraper-type>.service``
    * ``sudo systemctl start iris-scraper@<scraper-type>.service``
2. Now you can stop and deactivate the scraper used till now
    * ``sudo systemctl disable iris-scraper@<scraper-type>.service``
    * ``sudo systemctl stop iris-scraper@<scraper-type>.service``
3. Than, you must clean the websites so to remove the too-common websites that are likely false positives [3]
    * ``python clean-scraped-websites.py -I data/data_from_websites_scraper/results.jsonl data/websites_to_exclude.txt -o data/data_from_websites_scraper/results_clean.jsonl``
4. Lastly, you must use the VPM pages scraper with the following commands
    * ``sudo systemctl enable iris-scraper@vpm.service``
    * ``sudo systemctl start iris-scraper@vpm.service``
5. Again stop and deactivate the scraper used 
    * ``sudo systemctl disable iris-scraper@vpm.service``
    * ``sudo systemctl stop iris-scraper@vpm.service``

If you work in a GNU/Linux environment, you can have some basic statistics about the ongoing scraping process by running ``./stats.sh website`` (or ``vpm`` according to the step you are actually running)

[3] For now, this script is in Python. I advice you to execute it within a Conda environment. The ``json`` and ``datetime`` Python packages must be installed. The advice is to re-use the environment of the [iris-database](https://gitlab.tue.nl/iris/iris-database) repository.

## Working of the Systemd daemons
When you start one of the daemons, the script will start (provided that you have a working Internet connection) and will restart every time you switch on your RPi and get connected to the Internet.<br>
At the end of the scraping process, the rows on which an error has been reported are deleted and the scraper trys another time.<br>
The systemd daemon that controls this process will restard, if errors occurs, for 5 times authomatically. Than a manual intervention is required to, eventually, go on (consider that at least a restart is useful to deal with the eventual, but likely, errors that will occur during the scraping process; by experience, you can expect at least 0.15% failures in a "successful" run).

To stop the script, run<br>
``sudo systemctl stop iris-scraper.service``<br>
Be patient, it can take even more than 2 min to stop because of the way in which the JavaScript code is written.<br>
Moreover, consider that this is a brutal operation that will end in an ERROR in results.jsonl

To look what the script is doing, you can run the following command (use ``website``, ``website_sbir``, or ``vpm`` according with the daemon currently running)<br>
``journalctl -u iris-scraper@website.service -f``<br>
Press CTRL+C to go back to the shall

Note: Consider that, by deafult on the RPi the logs (i.e., what the ``journalctl`` command reads) are arases when you shoutdown the machine. To preserve the logs of past sessions you need either to run
* ``sudo mkdir -p /var/log/journald``
* ``sudo systemd-tmpfiles --create --prefix /var/log/journal``
* ``sudo systemctl restart systemd-journald``

or to set ``Storage=persistent`` into ``/etc/systemd/journal.conf``.

## Data format
The data files are formatted according to the JSONL (i.e., lines of JSON objects).

Each line must contain the following structure<br>
``{"award_recipient": "corporation name with legal type", "patent_assignee": "corporation name with legal type"}, "patent_id": [193765482, 917253468]``<br>
The award recipient's name is not mandatory.

To split the full database into random chunks one for each machine (RPi) you have, you can use the following commands
* ``shuf f_in.jsonl | split -a1 -d -l $(( $(wc -l <f_in.jsonl) * 1 / N )) - f_out``
* ``find . -type f ! -name "*.*" -exec mv {} {}.jsonl \;``
where f_in.jsonl is the full database; f_out is the name you want to give to the chunks (will be followed by a progressive number); N is the number of chunks you want to create; and `.` is the local folder (if the files are in another folder, substitute it with the correct path).<br>
Remember that the standard input file name for the scraping process is always ``data/data_from_database/data.jsonl``. The easiest way is simply copy one of the files with the progressive numbers in each device you have. Than, you can create locally a copy of the file simply called ``data/data_from_database/data.jsonl`` (to preserve the original file will help in remembering the progressive number, if it were useful for some reasons).<br>
Note: if the number of lines of the original file (f_in.jsonl) are not divisible by the number of chunks desired, an additional (N+1) file will be created with the few extra lines still unassigned.

After the scraping, you can collect the results from each device in a common folder. Rename each ``data/data_from_websites_scraper/results.jsonl`` file with a progressive number (as for the output files). Than, use a command like this to concatenate the output files in a common one<br>
``cat dod_sbir_citations_to_scrape_with_potential_websites_<?>.jsonl > dod_sbir_citations_to_scrape_with_potential_websites.jsonl``<br>
where the star (``<?>``) stands for any of the progressive numbers.<br>
Note: it works only if you have less than 10 files.

## Control the process remotely
From the RPi configuration tool (``sudo raspi-config`` or from the desktop menu) enable the CLI interface (not mandatory) and enable the SSH interface.<br>
You can now controll the RPi remotely through SSH, both from another computer, or through a smartphone App (there are even some explicitely dedicated to the RPi).

## Use a Proxy server
It is possible to use a proxy server. To do so, you must modify the ``proxy.conf.example`` file and rename it as ``proxy.conf``.

Parameters:<br>
* ``PROXY_ADDRESS`` is the address of the proxy server
* ``PROXY_PORT`` is the port of the proxy server
* ``PROXY_USER`` is the proxy server's username
* ``PROXY_PASSWORD`` is the proxy server's password
* ``PROXY_ROTATE`` is the API address called to rotate your proxy server
* ``PROXY_STATUS`` is a function (passed as a string) that must return two values [proxy_ok, proxy_msg]: a boolean that sais whether the proxy rotated correctly and a string that will be printed (e.g., with the IP address assigned by the proxy server)

## Run the scraper without Systemd
You can also ran the scraping process without the use of Systemd. In this case, you must run<br>
* ``node scrape-for-websites.js -i <INPUT_FILE.jsonl> -o <OUTPUT_FILE.jsonl> --sbir <true/false> --proxy <true/false> --timestamp <true/false>``
* ``node scrape-for-vpm-pages.js -i <INPUT_FILE.jsonl> -o <OUTPUT_FILE.jsonl> --sbir <true/false> --proxy <true/false> --timestamp <true/false>``

Parameters<br>
* ``i`` is the input file
* ``o`` is the output file
* ``sbir`` uses also the SBIR website as a source of information (default ``false``). Note: anyhow, only the lines with an ``award_recipient`` use also the SBIR website
* ``proxy`` uses the ``proxy.conf`` parameters in the scraper
* ``timestamp`` prints also the date alongside the messages

## Acknowledgements
The authors thank the EuroTech Universities Alliance for sponsoring this work. Carlo Bottai was supported by the European Union's Marie Skłodowska-Curie programme for the project Insights on the "Real Impact" of Science (H2020 MSCA-COFUND-2016 Action, Grant Agreement No 754462).
