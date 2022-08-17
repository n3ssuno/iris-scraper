/*
 * This file scrapes, from Google Search, the potential VPM pages of
 *  corporations that received R&D awards from the US Federal Govornment
 *  and/or that applied for a patent, somehow connected to these awards,
 *  at the USPTO
 *
 * Author: Carlo Bottai
 * Copyright (c) 2020 - TU/e and EPFL
 * License: See the LICENSE file.
 * Date: 2020-10-15
 */

'use strict';

/***************/
/*   MODULES   */
/***************/

const fs = require('fs');

const args = require('minimist')(
  process.argv,
  { boolean: ['proxy', 'timestamp'] });

const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
puppeteer.use(stealthPlugin);
const blockResourcesPlugin = require('puppeteer-extra-plugin-block-resources')();
puppeteer.use(blockResourcesPlugin);

const UserAgents = require('user-agents');

const chalk = require('chalk');

const performance = require('perf_hooks').performance;

const os = require('os');

const got = require('got');

/**********************/
/*  CUSTOM VARIABLES  */
/*    AND FUNCTIONS   */
/**********************/

const resultsLabel = 'vpm_pages';

let scraper_config = fs.readFileSync('scraper.conf', 'utf8');
scraper_config = JSON.parse(scraper_config);
const useHeadless = scraper_config['USE_HEADLESS'];
let chromePath;
if (scraper_config['CHROME_PATH']) {
  chromePath = scraper_config['CHROME_PATH'];
} else if (os.platform()=='win32') {
  chromePath = 'C:\\Program\ Files\ \(x86\)\\Google\\Chrome\\Application\\chrome.exe';
} else if (fs.existsSync('/usr/bin/google-chrome-stable')) {
  chromePath = '/usr/bin/google-chrome-stable';
} else {
  chromePath = '/usr/bin/chromium-browser';
}
const useMobile = scraper_config['USE_MOBILE'];
let setUserAgent;
let setDefaultViewport;
if (useMobile) {
  setUserAgent = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 10 Build/MOB31T) ' +
                  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                  'Chrome/75.0.3765.0 Safari/537.36';
  setDefaultViewport = {
    width: 800,
    height: 1280,
    deviceScaleFactor: 1,
    isMobile: useMobile,
    hasTouch: useMobile,
    isLandscape: false,
  }
} else {
  const setData = UserAgents.random({ deviceCategory: 'desktop' }).data;
  setUserAgent = setData.userAgent;
  setDefaultViewport = {
    width: setData.viewportWidth,
    height: setData.viewportHeight,
    deviceScaleFactor: 1,
    isMobile: useMobile,
    hasTouch: useMobile,
    isLandscape: false,
  }
}
let browser_config = [
  `--use-mobile-user-agent=${useMobile}`,
  `--user-agent=${setUserAgent}`,
  '--ignore-certificate-errors',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--window-position=0,0',
  '--start-fullscreen',
  '--hide-scrollbars',
]

let proxy_config = null;
if (fs.existsSync('proxy.conf')) {
  proxy_config = fs.readFileSync('proxy.conf', 'utf8');
  proxy_config = JSON.parse(proxy_config);
}
let proxy_status;
if (args['proxy']) {
  proxy_config['PROXY_DOMAIN'] = proxy_config['PROXY_ADDRESS'].split('.')
  proxy_config['PROXY_DOMAIN'] = proxy_config['PROXY_DOMAIN'].slice(
    Math.max(proxy_config['PROXY_DOMAIN'].length - 2, 1)).join('.')
  browser_config.push(
    '--proxy-server=' +
    `${proxy_config['PROXY_ADDRESS']}:` + 
    `${proxy_config['PROXY_PORT']}`);
  browser_config.push(
    '--proxy-bypass-list=' +
    `"*.${proxy_config['PROXY_DOMAIN']}"`);
    proxy_status = new Function('res', proxy_config['PROXY_STATUS']);
}

const log_timestamp = args['timestamp']==true ? 
  require('log-timestamp')(() => {return new Date().toLocaleString();}) : 
  null;

const utils = require('./utils.js');
const getDataAlreadyScraped = utils.getDataAlreadyScraped;
const isAlreadyScraped = utils.isAlreadyScraped;
const randomSleep = utils.randomSleep;
const printMsAsMinAndSec = utils.printMsAsMinAndSec;
const sleepFor = utils.sleepFor;
const scrapeVPMPages = utils.scrapeVPMPages;

/*****************/
/*  MAIN SCRIPT  */
/*****************/

(async() => {
  const path_in = args['i'];
  const path_out = args['o'];
  
  let allScraped;
  do {
    allScraped = [];
    const f_in = fs.readFileSync(path_in, 'utf-8').split('\n').filter(el => el);
    
    let dataAlreadyScraped = null;
    if (fs.existsSync(path_out)) {
      dataAlreadyScraped = getDataAlreadyScraped(path_out);
    }
    
    try {
      const browser = await puppeteer.launch({ 
        headless: useHeadless,
        executablePath: chromePath, 
        defaultViewport: setDefaultViewport,
        args: browser_config,
      });

      if (useMobile) {
        blockResourcesPlugin.blockedTypes.add('stylesheet');
        blockResourcesPlugin.blockedTypes.add('image');
        blockResourcesPlugin.blockedTypes.add('media');
        blockResourcesPlugin.blockedTypes.add('font');
        blockResourcesPlugin.blockedTypes.add('xhr');
        blockResourcesPlugin.blockedTypes.add('other');
      }
      
      let avgTimePerIteration = [];
      let avgTotTimePerIteration = [];
      let roundsSinceLastProxyRotation = 0;
      for await (const [idx, line] of f_in.entries()) {
        const loopStart = performance.now();

        const data = await JSON.parse(line);

        const alreadyScraped = await isAlreadyScraped(data, dataAlreadyScraped);
        allScraped.push(alreadyScraped);

        if (!alreadyScraped) {
          try {
            if (args['proxy'] && roundsSinceLastProxyRotation%10==0) {
              const proxy_rotate = await got(proxy_config['PROXY_ROTATE']);
              await sleepFor(10000);
              const [proxy_ok, proxy_msg] = proxy_status(proxy_rotate.body);
              if (proxy_ok) {
                console.log(chalk.green('PROXY STATUS: OK'));
                console.log(chalk.green(proxy_msg));
              } else {
                console.error(chalk.red(proxy_status.body));
              }
            }
            roundsSinceLastProxyRotation += 1;
            
            let websites = await data.scraped_websites;
            let patents = await data.patent_id;
            // if (!patents) patents = await data.forward_citation_id;
            
            let nGroups = 0;
            if (websites[0]) {
              const nWebsites = websites.length;
              const nPatents = patents.length;
              nGroups = Math.ceil(nPatents/(30-nWebsites));
              const chunkSize = Math.ceil(nPatents/nGroups);
              let patentsChunks = [];
              for (let jdx = 0; jdx < nPatents; jdx += chunkSize) {
                let chunk = patents.slice(jdx, jdx + chunkSize);
                patentsChunks.push(chunk);
              }
              var detectedResults = [];
              for await (const [jdx, patentsChunk] of patentsChunks.entries()) {
                
                const query = '(' + 
                  websites.map(el => `site:${el}`).join(' OR ') + 
                  ') AND (' + 
                  patentsChunk.join(' OR ') + 
                  ')';

                  const resultsPerPage = 10;
                  const maxExpResults = Math.ceil(websites.length * patents.length / resultsPerPage);

                const detectedResultsChunk = await scrapeVPMPages(
                  browser,
                  {who:query, mobile:useMobile, maxExpResults:maxExpResults});
                detectedResults.push(detectedResultsChunk);
                if (jdx < patentsChunks.length - 1) {
                  console.log('Wait for other 2:10 min so to be undetectable');
                  await sleepFor((2*60+10)*1000);
                }
              }
              
              // console.log(detectedResults);
              detectedResults = [].concat(...detectedResults);
              detectedResults = detectedResults.filter(el => el);
              if (detectedResults.length===0) detectedResults = [null]; 
              detectedResults = [...new Set(detectedResults)];
            } else {
              console.log(chalk.blue.bold(
                'Nothing to scrape for ' +
                `${[data.patent_assignee, data.award_recipient].filter(el => el).join(' or ')} ` +
                'since no useful website has been detected ' + 
                'in the previous scraping phase'));
              var detectedResults = [null];
            }
            
            data[resultsLabel] = detectedResults;
            fs.appendFileSync(path_out, `${JSON.stringify(data)}\n`, 'utf8');
            
            if (nGroups) {
              const loopEnd = performance.now();
              let iterationTime = loopEnd - loopStart - (2*60+10)*1000*(nGroups-1);
              avgTimePerIteration.push(iterationTime);
              let currentAvgTimePerIteration = avgTimePerIteration.reduce((a, b) => {
                return (a + b);
              }) / avgTimePerIteration.length;
              
              // Say that the goal is to scrape at a 2 min rate (+- 30 sec)
              // If an iteration takes lass than a random wait centered around this target rate
              //  ask the script to wait for longer
              // If the previous iterations took more than 2.5 min, try to reach the target rate
              //  reducing the waiting time of the difference between 2 min and the current
              //  average waiting time per iteration
              const scraping_rate = scraper_config['SCRAPING_RATE'];
              let randomWait = randomSleep(scraping_rate - 30, scraping_rate + 30, iterationTime);
              avgTotTimePerIteration.push(iterationTime + randomWait);
              let currentAvgTotTimePerIteration = avgTotTimePerIteration.reduce((a, b) => {
                return (a + b);
              }) / avgTotTimePerIteration.length;
              // If the average is above the upper limit, reduce the waiting time of 
              //  the current average minus the scraping rate (plus a 5%)
              if (currentAvgTotTimePerIteration > (scraping_rate + 30) * 1000) {
                const scraping_rate_5pc = (scraping_rate * 1000) + (scraping_rate * 50);
                randomWait -= Math.max(0, currentAvgTotTimePerIteration - scraping_rate_5pc);
                randomWait = Math.max(iterationTime < 30 * 1000 ? 30 * 1000 : 0, randomWait);
              }
              
              iterationTime = printMsAsMinAndSec(iterationTime);
              currentAvgTimePerIteration = printMsAsMinAndSec(currentAvgTimePerIteration);
              currentAvgTotTimePerIteration = printMsAsMinAndSec(currentAvgTotTimePerIteration);
              const randomWaitToPrint = printMsAsMinAndSec(randomWait);
              
              console.log(
                `Loop iteration took ${iterationTime} ` +
                `(avg: ${currentAvgTimePerIteration})`);
              console.log(
                `Wait for other ${randomWaitToPrint} so to be undetectable ` + 
                `(avg tot time: ${currentAvgTotTimePerIteration})`);
              
              if (idx < f_in.length - 1) await sleepFor(randomWait);
            }
          } catch(e) {
            console.error(chalk.red(`Error: ${e}`));
            const msSleep = randomSleep(90, 150);
            await sleepFor(msSleep);
            var detectedResults = ['ERROR'];
          }
        }
      }
      
      await browser.close();
      
      let results = fs.readFileSync(path_out, 'utf8');
      let folder_out = path_out.split('/').slice(0,-1).join('/');
      if (folder_out=='') {
        folder_out = '.'
      }
      let file_out = path_out.split('/').slice(-1)[0];
      const now = new Date();
      const year = now.getFullYear().toString().substr(2,2);
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const second = now.getSeconds();
      const file_bak = file_out.split('.').slice(0,1) + 
        `_${year}${month}${day}${hour}${minute}${second}` + 
        '.' + file_out.split('.').slice(1);
      fs.writeFileSync(`${folder_out}/${file_bak}`, results);
      results = results.split('\n');
      results = results.filter(el => el);
      results = results.map(el => JSON.parse(el));
      results = results.filter(el => {
        if (el[resultsLabel]) {
          return el[resultsLabel][0]!='ERROR';
        } else {
          return false;
        }
      });
      results = results.map(JSON.stringify).join('\n') + '\n';
      fs.writeFileSync(path_out, results);
      
      allScraped = !allScraped.every(el => el);
      if (allScraped) {
        console.log(chalk.red.italic(
          '\nThe scraping is going to restart in 10 sec.\n' +
          'Stop the Systemd daemon (or press CTRL+C) to stop it\n'));
        await sleepFor(10000);
      } else {
        console.log(chalk.green.italic(
          '\nThe scraping has been successfully completed'));
      }
    } catch(e) {
      console.error(chalk.red(`Error: ${e}`));
    }
  } while (allScraped);

  process.exit();
})();
