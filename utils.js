/*
 * Functions useful for the two scrapers 
 *  present in this repository
 *
 * Author: Carlo Bottai
 * Copyright (c) 2021 - TU/e and EPFL
 * License: See the LICENSE file.
 * Date: 2021-02-22
 */

'use strict';

const args = require('minimist')(
  process.argv,
  { boolean: ['sbir', 'proxy', 'timestamp'] });
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const chalk = require('chalk');
const assert = require('assert');

const devices = puppeteer.pptr.devices;
// Also 'iPad Mini' and 'iPad Pro' should be ok
const device = 'Nexus 10';
// const deviceList = [
//   'iPad Mini',
//   'iPad Pro',
//   'Nexus 10']

const timeoutSetting = 180000; // null
const debugPath = 'debugging_screenshots';

let scraper_config = fs.readFileSync('scraper.conf', 'utf8');
scraper_config = JSON.parse(scraper_config);
const useHeadless = scraper_config['USE_HEADLESS'];

let proxy_config = null;
if (fs.existsSync('proxy.conf')) {
  proxy_config = fs.readFileSync('proxy.conf', 'utf8');
  proxy_config = JSON.parse(proxy_config);
}

function printMsAsMinAndSec(ms) {
  const min = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(0);
  if (min===0) {
    return sec + ' sec';
  } else {
    return min + ':' + (sec < 10 ? '0' : '') + sec + ' min';
  }
}

function randomSleep(minWait, maxWait, msAlreadyWaited=0) {
  // minWait, maxWait in seconds
  let rSleep = (Math.random() * (maxWait - minWait) + minWait) * 1000;
  rSleep -= msAlreadyWaited;
  rSleep = Math.max(rSleep, 0);
  return rSleep;
}

function sleepFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/*
 * function printSleepFor(ms) {
 *   console.log(
 *     '\n++++++++++++++++++++++++++++++++++++\n' + 
 *     `${new Date().toLocaleString('en-GB', { hour12: false, })}\n` + 
 *     `Wait for ${printMsAsMinAndSec(ms)}\n` + 
 *     '++++++++++++++++++++++++++++++++++++\n'
 *   );
 * }
 */

/*
 * function choose(choices) {
 *   const index = Math.floor(Math.random() * choices.length);
 *   return choices[index];
 * }
 */

/*
 * async function cleanString(s) {
 *   if (s && !(s.startsWith('__') && s.endsWith('__'))) {
 *     // Words like __PERSON__ are considered reserved words
 *     s = s.toLowerCase();
 *     s = s.replace(/([^a-z0-9&\s]+)/gi, '');
 *   }
 *   return s;
 * }
 */

function cleanURL(url) {
  if (url) {
    url = url.replace(/https?:\/\//,'');
    url = url.replace('www.','');
    url = url.replace(/^m\./,'');
    url = url.split('/')[0];
  }
  return url;
}

async function getOrganizations(data, shorter=false, minimal=false) {
  try {
    const replacers = {
      '%':'%25', '\"':'%22', '!':'%21', '#':'%23', '$':'%24', '\'':'%27', 
      '(':'%28', ')':'%29', '*':'%2A', '+':'%2B', ',':'%2C', '-':'%2D', 
      '.':'%2E', '/':'%2F', ':':'%3A', ';':'%3B', '<':'%3C', '=':'%3D', 
      '>':'%3E', '?':'%3F', '@':'%40', '[':'%5B', ']':'%5D', '^':'%5E', 
      '_':'%5F', '{':'%7B', '|':'%7C', '}':'%7D', '\\':'%5C'}
    
    const legalEntityTypes = {
      'corp': 'corporation',
      'inc': 'incorporated',
      'co': 'company',
      'ltd': 'limited',
      'llc': 'limited liability company',
      'lp': 'limited partnership',
      'rllp': 'registered limited liability partnership',
      'llp': 'limited liability partnership',
      'rlllp': 'registered limited liability limited partnership',
      'lllp': 'limited liability limited partnership',
      'pc': 'professional corporation',
      'pllc': 'professional limited liability company',
      'psc': 'professional service corporation',
      'pa': 'professional association',
      'pty': 'proprietary',
    }
    
    const toExclude = [
      'university', 
      'institute of technology', 
      'college', 
      'national institutes of health' ,
      'national science foundation', 
      'represented by'
    ];

    let assignee = await data.patent_assignee;
    if (assignee && !(assignee.startsWith('__') && assignee.endsWith('__'))) {
      assignee = assignee.toLowerCase();
    }
    const assigneeOrig = assignee;
    let recipient = await data.award_recipient;
    if (recipient && !(recipient.startsWith('__') && recipient.endsWith('__'))) {
      recipient = recipient.toLowerCase();
    }
    const recipientOrig = recipient;
    
    var assigneeLongType = assignee;
    if (assignee) {
      if (toExclude.some(s => assignee.match(s)) || assignee=='__PERSON__') {
        assignee = null;
        assigneeLongType = null;
      } else {
        // remove THE at the beginning since sometimes is written without 
        //  and you cannot find it since you use "THE <-->" in tue query
        assignee = assignee.replace(/^the /,''); 
        for (const [key, value] of Object.entries(replacers)) {
          assignee = assignee.split(key).join(value);
        }
        for (const [key, value] of Object.entries(legalEntityTypes)) {
          const repl = new RegExp(` ${key}$`);
          assigneeLongType = assigneeLongType.replace(repl,` ${value}`);
        }
      }
    }
    
    var recipientLongType = recipient;
    if (recipient) {
      if (toExclude.some(s => recipient.match(s))) {
        recipient = null;
        recipientLongType = null;
      } else {
        // remove THE at the beginning since sometimes is written without 
        //  and you cannot find it since you use "THE <-->" in tue query
        recipient = recipient.replace(/^the /,'');
        for (const [key, value] of Object.entries(replacers)) {
          recipient = recipient.split(key).join(value);
        }
        for (const [key, value] of Object.entries(legalEntityTypes)) {
          const repl = new RegExp(` ${key}$`);
          recipientLongType = recipientLongType.replace(repl,` ${value}`);
        }
      }
    }
    
    let organization = [
      assignee, assigneeLongType, 
      recipient, recipientLongType];
    if (shorter) organization = [assignee, recipient];
    organization = [...new Set(organization)];
    if (organization.length>1) organization = organization.filter(el => el);
    let organizationWOLegalEntity;
    if (organization[0]) {
      // For each organization with " & " or " AND " in its name, add also the opposite
      const organizationAnd = organization.filter(el => el.search(' & ')>=0).map(el => el.replace(' & ',' and '));
      const organizationAmp = organization.filter(el => el.search(' and ')>=0).map(el => el.replace(' and ',' & '));
      if (!minimal) organization = [...organization, ...organizationAnd, ...organizationAmp];
      organization = organization.map(el => el.split('&').join('%26'));
      // Remove the parts in parenthesis (both is the parenthesis is closed or if the name ends without closing it)
      organization = organization.map(el => el.replace(/\(.*\)/,'').replace(/\s+/g,' ').trim());
      organization = organization.map(el => el.replace(/\([^\)]*$/,'').replace(/\s+/g,' ').trim());
      
      const legalEntity = [...Object.keys(legalEntityTypes), ...Object.values(legalEntityTypes)];
      const repl = new RegExp(`\\s(${legalEntity.join('|')})$`);
      organizationWOLegalEntity = organization.map(el => el.replace(repl,''));
      organizationWOLegalEntity = [...new Set(organizationWOLegalEntity)];
      
      let nKeywords = organization.map(el => el.split(' ').length).reduce((a, b) => a + b, 0);
      if (nKeywords>25) {
        if (shorter) {
          if (minimal) {
	    console.log(`Organization: ${organization}`)
            console.error(chalk.red('More than 32 keywords for this query. ' +
                          'Google does not support this and a solution ' +
                          'has not been implemented in the script for now. ' +
                          'You will find an ERROR in the results'));
            return ['ERROR', 'ERROR'];
          } else {
            return await getOrganizations(data, shorter=true, minimal=true);
          }
        } else {
          return await getOrganizations(data, shorter=true);
        }
      }
      
      organization = organization.map(el => `"${el}"`);
      organizationWOLegalEntity = organizationWOLegalEntity.map(el => `"${el}"`);
      if (organization.length>1) {
        organization = organization.join(' OR ');
        organization = `(${organization})`;
      } else {
        organization = organization[0];
      }
      if (organizationWOLegalEntity.length>1) {
        organizationWOLegalEntity = organizationWOLegalEntity.join(' OR ');
        organizationWOLegalEntity = `(${organizationWOLegalEntity})`;
      } else {
        organizationWOLegalEntity = organizationWOLegalEntity[0];
      }
      return [organization, organizationWOLegalEntity];
    } else {
      console.log(chalk.blue.bold(
        'Nothing to scrape for ' +
        `${[assigneeOrig, recipientOrig].filter(el => el).join(' or ')}`));
      return [null, null];
    }
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
    return ['ERROR', 'ERROR'];
  }
}

function getDataAlreadyScraped(path_out) {
  let dataAlreadyScraped = null;
  let alreadyScrapedRows = fs.readFileSync(path_out, 'utf8');
  alreadyScrapedRows = alreadyScrapedRows.split('\n');
  alreadyScrapedRows = alreadyScrapedRows.filter(el => el);
  dataAlreadyScraped = [];
  for (let alreadyScrapedRow of alreadyScrapedRows) {
    if (alreadyScrapedRow) {
      alreadyScrapedRow = JSON.parse(alreadyScrapedRow);
      alreadyScrapedRow = (({
        award_recipient, patent_assignee, 
        patent_id, // forward_citation_id, control_patent_id, control_forward_citation_id, 
      }) => ({
        award_recipient, patent_assignee, 
        patent_id, // forward_citation_id, control_patent_id, control_forward_citation_id, 
      }))(alreadyScrapedRow);
      dataAlreadyScraped.push(alreadyScrapedRow);
    }
  }
  return dataAlreadyScraped;
}

async function isAlreadyScraped(data, dataAlreadyScraped) {
  if (dataAlreadyScraped) {
    const dataCheckScraped = (({
      award_recipient, patent_assignee, 
      patent_id, // forward_citation_id, control_patent_id, control_forward_citation_id,
    }) => ({
      award_recipient, patent_assignee, 
      patent_id, // forward_citation_id, control_patent_id, control_forward_citation_id, 
    }))(data);

    let alreadyScraped = null;
    for await (let alreadyScrapedElem of dataAlreadyScraped) {
      alreadyScrapedElem = JSON.stringify(alreadyScrapedElem);
      if (alreadyScrapedElem == JSON.stringify(dataCheckScraped)) {
        alreadyScraped = alreadyScrapedElem;
        break;
      }
    }

    if (alreadyScraped) {
      // console.log(chalk.green.italic('Skip because already scraped'));
      // console.log(chalk.green(`${alreadyScraped}\n`));
      return true;
    }
  }
  return false;
}

async function scrollPageToBottom(page){
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if(totalHeight >= scrollHeight){
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

async function openPage(browser, {url, mobile}) {
  try {
    const page = await browser.newPage();

    if (timeoutSetting) await page.setDefaultTimeout(timeoutSetting);
    
    // TODO remove "mobile" from the functions that do not need it anymore
    // FIXME this line is still useful only because I wan't able to overwrite
    //  the navigator.platform that is Win32 if I don't use this command, 
    //  while it should be something else (e.g., Linux x86_64 in case of an
    //  Android device)
    const emulatedDevice = devices[device]; // choose(deviceList)
    if (mobile) await page.emulate(emulatedDevice);

    if (args['proxy']) {
      await page.authenticate({
        'username': proxy_config['PROXY_USER'],
        'password': proxy_config['PROXY_PASSWORD'],
      });
    }
    
    await page.goto(url, { waitUntil: 'networkidle2', }); // networkidle0
    
    return page;
    
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
  }
}

async function checkIfDetected(page, source) {
  switch (source) {
    case 'Google': {
      try{
        if (await page.url().startsWith('https://www.google.com/sorry/')) {
          // Faster way to understand if scrape has been detected
          throw 'Scraper detected by Google';
        } /*else { 
          // Slower way to understand if scrape has been detected
          // Note: it works only if you check it before doing anything else in the page
          //  (e.g., before typing in the search bar)
          const isDetected = await page.$eval('body', el => el.getAttribute('onload'));
          if (isDetected && isDetected.toString().match('captcha')) {
            throw 'Scraper detected by Google';
          }
        } */
        return false;
      } catch(e) {
        console.error(chalk.red(`Error: ${e}`));
        return true;
      }
    }
    case 'Bing': {
      // TODO implement it
      try {
        return false;
      } catch(e) {
        console.error(chalk.red(`Error: ${e}`));
        return true;
      }
    }
    case 'SBIR': {
      // TODO implement this
      try {
        return false;
      } catch(e) {
        console.error(chalk.red(`Error: ${e}`));
        return true;
      }
    }
    case 'Bloomberg': {
      try {
        if (page.url().startsWith('https://www.bloomberg.com/tosv2.html')) {
          throw 'Scraper detected by Bloomberg';
        }
        return false;
      } catch(e) {
        console.error(chalk.red(`Error: ${e}`));
        return true;
      }
    }
  }
}

async function searchOnGoogle(browser, {query, msg, mobile, maxExpResults}) {
  const replacers = {
    '%':'%25', '\"':'%22', '!':'%21', '#':'%23', '$':'%24', '\'':'%27', 
    '(':'%28', ')':'%29', '*':'%2A', '+':'%2B', ',':'%2C', '-':'%2D', 
    '.':'%2E', '/':'%2F', ':':'%3A', ';':'%3B', '<':'%3C', '=':'%3D', 
    '>':'%3E', '?':'%3F', '@':'%40', '[':'%5B', ']':'%5D', '^':'%5E', 
    '_':'%5F', '{':'%7B', '|':'%7C', '}':'%7D', '\\':'%5C', '&':'%26'}

  const domain = 'https://www.google.com/search?gl=us&hl=en&num=10&q=';
  //query = `${domain}${query}`;

  console.log(chalk.blue.bold(msg));
  console.log(chalk.blue(`\t${domain}${query}`));

  let googleMainSelector,
      googleResultsSelector,
      googleMoreResults;
  if (mobile) {
    googleMainSelector = '#main'
    googleResultsSelector = 'img[alt="Image"]';
    //googleResultsSelector = 'img ~ span span:first-of-type';
    // This is another way to scrape the URLs from Google results page 
    //  (for the mobile version) that must be used in combination 
    //  with the other commented row here after (*)
    // This works only if you are interested in the domain of the result,
    //  not in its full URL
    googleMoreResults = 'a[aria-label="More results"]';
  } else {
    googleMainSelector = '#search'
    // const googleResultsSelector = '#search .g .r > a';
    // This is another way to scrape the URLs from Google results page 
    //  (for the desktop version) that must be used in combination 
    //  with the other commented row here after (**)
    googleResultsSelector = '.g cite';
  }
  
  const page = await openPage(browser, {url:'https://www.google.com/?gl=us&hl=en', mobile:mobile}); //query
  
  let noResultsFoundTop,
      noResultsFoundBot;
  try {
    query = await query.split('+').join(' ');
    for (const [key, value] of Object.entries(replacers)) {
      query = query.split(value).join(key);
    }
    await page.waitForSelector('input[name=q]');
    await page.click('input[name=q]');
    await sleepFor(2000);
    await page.type('input[name=q]', query, { delay:50 });
    await sleepFor(1000);
    await page.keyboard.press('Enter');
    await sleepFor(2000);

    const detected = await checkIfDetected(page, 'Google');
    if (detected) {
      console.log('Wait for 2h and try again');
      await sleepFor(60*60*2*1000);
    }
    
    await page.waitForSelector(googleMainSelector);
    
    const pageTitle = await page.title();
    assert(pageTitle.endsWith('Google Search'));
   
    noResultsFoundTop = await page.$$eval('#topstuff',
                                          els => els.map(el => el.innerText));
    noResultsFoundBot = await page.$eval('#botstuff',
                                         el => el.innerText);
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
    await page.screenshot({ path: `${debugPath}/error_google_results.png` });
    var googleResults = ['ERROR'];
  }
  
  // TODO Implement it also for the desktop version
  if (maxExpResults && mobile) {
    for (let i=0; i<maxExpResults; i++) {
      try {
        await page.waitForSelector(googleMoreResults, 
                                   { timeout: 10000 });
        await scrollPageToBottom(page);
        await page.click(googleMoreResults);
        await sleepFor(15000);
      } catch {
        // If the "More results" button does not exist there is nothing to do
        //  and the script can move on
        break;
      }
    }
  }
  
  try {
    var googleResults = [null];
    if (!noResultsFoundTop.some(el => {
      return el.toLowerCase().includes('no results found for');
    }) && !noResultsFoundTop.some(el => {
      return el.toLowerCase().includes('did not match any documents');
    })) {
      await page.waitForSelector(googleResultsSelector, 
                                 { timeout: 30000 });
      if (mobile) {
        googleResults = await page.$$eval(googleResultsSelector, els => {
          return els.map(el => {
            return el.closest('a').href; // parentElement.parentElement.parentElement
            // return el.innerText;
            // See above (*)
          });
        });
      } else {
        googleResults = await page.$$eval(googleResultsSelector, els => {
          return els.map(el => {
            return el.innerHTML.split('<span')[0];
            // return el => el.href;
            // See above (**)
          });
        });
      }
      googleResults = [...new Set(googleResults)];
    }
  } catch(e) {
    if (noResultsFoundBot.toLowerCase().replace(/[^a-zA-Z\s]+/g, '')
          .includes('get the answer youre looking for added to the web')) {
      var googleResults = [null];
    } else {
      console.error(chalk.red(`Error: ${e}`));
      await page.screenshot({ path: `${debugPath}/error_google_results.png` });
      var googleResults = ['ERROR'];
    }
  }
  
  // console.log(googleResults);
  
  if (!useHeadless) await sleepFor(15000); 
  await page.close();
  
  return googleResults;
}

async function searchOnBing(browser, {query, msg, mobile}) {
  const domain = 'https://www.bing.com/search?cc=us&mkt=en-US&setLang=EN&count=20&q=';
  query = `${domain}${query}`;

  console.log(chalk.blue.bold(msg));
  console.log(chalk.blue(`\t${query}`));
  
  const bingResultsSelector = '#b_results .b_algo';
  
  const page = await openPage(browser, {url:query, mobile:mobile});
  
  try {
    // sleep for 2 h if detected
    const detected = await checkIfDetected(page, 'Bing');
    if (detected) {
      console.log('Wait for 2h and try again');
      await sleepFor(60*60*2*1000);
    }
    
    await page.waitForSelector(bingResultsSelector.split(' ')[0]);
    
    const pageTitle = await page.title();
    assert(pageTitle.endsWith('Bing'));
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
    await page.screenshot({ path: `${debugPath}/error_bing_results.png` });
    var bingResults = ['ERROR'];
  }
  
  try {
    await page.waitForSelector(bingResultsSelector, 
                               { timeout: 30000 });
    var bingResults = await page.$$eval(`${bingResultsSelector} h2 a`, els => {
      els.map(el => {
        el = el.href;
        return el;
      });
    });
    const bingUnsponsoredResults = await page.$$eval(`${bingResultsSelector} p`, els => {
      return els.map(el => el.innerHTML.includes('<strong>'));
    });
    bingResults = bingResults.filter((r, i) => bingUnsponsoredResults[i]==true);
    if (bingResults.length==0) bingResults = [null];
  } catch(e) {
    var bingResults = [null];
  }
  
  // console.log(bingResults);
  
  if (!useHeadless) await sleepFor(15000); 
  await page.close();
  
  return bingResults;
}

async function searchOnSBIR(browser, {query, msg, mobile}) {
  const domain = 'https://www.sbir.gov/search-result-page?gl=us&hl=en&num=10&search=';
  query = `${domain}${query}`;

  console.log(chalk.blue.bold(msg));
  console.log(chalk.blue(`\t${query}`));
  
  const sbirResultsSelector = '.gsc-resultsbox-visible';
  const sbirSpellingSelector = '.gs-spelling:first-of-type';
  
  const page = await openPage(browser, {url:query, mobile:mobile});
  
  try {
    // sleep for 2 h if detected
    const detected = await checkIfDetected(page, 'SBIR');
    if (detected) {
      console.log('Wait for 2h and try again');
      await sleepFor(60*60*2*1000);
    }
    
    await page.waitForSelector(sbirResultsSelector);
    
    const pageTitle = await page.title();
    assert(pageTitle.endsWith('Search Results | SBIR.gov'));
    
    await page.waitForSelector(sbirResultsSelector);
    let noResultsFound = await page.$$eval(`${sbirResultsSelector} .gs-snippet`, els => {
      return els.map(el => el.innerText);
    });
    noResultsFound = await noResultsFound.some(el => el==='No Results');
    if (noResultsFound) {
      try {
        await page.waitForSelector(sbirSpellingSelector, 
                                   { timeout: 10000 });
        let fixedQuery = await page.$eval(`${sbirSpellingSelector} a`, el => {
          el.innerText
        });
        fixedQuery = await fixedQuery.split(' ').join('+');
        const fixedMsg = 'Fixed SBIR-search page'
        var sbirResults = await searchOnSBIR(
          browser, 
          {query:fixedQuery, msg:fixedMsg, mobile:mobile});
      } catch(e) {
        var sbirResults = [null];
      }
    } else {
      var sbirResults = await page.$$eval(`${sbirResultsSelector} a.gs-title`, els => {
        return els.map(el => {
          el = el.href;
          el = el.split('?page=')[0];
          el = el.replace('http://','https://');
          return el;
        });
      });
      sbirResults = [...new Set(sbirResults)];
    }
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
    await page.screenshot({ path: `${debugPath}/error_sbir_results.png` });
    var sbirResults = ['ERROR'];
  }
  
  // console.log(sbirResults);
  
  if (!useHeadless) await sleepFor(15000); 
  await page.close();
  
  return sbirResults;
}

async function scrapeURL(browser, {url, mobile}) {
  try {
    const whereDomain = await (url.match(/www\.[a-z]*\.[a-z]{3}/))[0];
    switch (whereDomain) {
      case 'www.sbir.gov': {
        const resultsSelector = 'a[title="Company Website"]';
        
        console.log(chalk.blue(`${chalk.bold('SBIR page -> ')}${url}`));
        
        let page, 
            detected;
        do {
          page = await openPage(browser, {url:url, mobile:mobile});
          
          detected = await checkIfDetected(page, 'SBIR');
          // If detected, sleep for a random time between 1 and 10 min
          // This is useful to deal with the cases in which different scrapers
          //  on the same network scrapes the SBIR/Bloomberg pages too fastly
          if (detected) {
            console.log('Wait for 10m and try again');
            await sleepFor(10*60*1000);
          }
        } while (detected);
        
        try {
          await page.waitForSelector(resultsSelector, 
                                     { timeout: 10000 });
          let urls = await page.$$eval(resultsSelector, 
                                       links => links.map(link => link.href));
          if (!urls.length) {
            var url = null;
          } else if (urls.length>1) {
            console.warn(
              `More than one URL detected in the ${source} page. ` +
              'This issue is not implemented in the code. ' +
              'We put ERROR instead');
            var url = 'ERROR';
          } else {
            var url = urls[0];
          }
        } catch(e) {
          if (e.toString().includes(resultsSelector)) {
            var url = null;
          } else {
            console.error(chalk.red(`Error: ${e}`));
            var url = 'ERROR';
          }
        }
        
        var skipped = false;
        
        if (!useHeadless) await sleepFor(15000);
        await page.close();
        
        return [url, skipped];
      }
      case 'www.bloomberg.com': {
        const resultsSelector = 'div[class^=\'infoTable_\']';
        
        if (url.endsWith(':US')) {
          console.log(chalk.blue(`${chalk.bold('Bloomberg page -> ')}${url}`));
          
          let page,
              detected;
          do {
            page = await openPage(browser, {url:url, mobile:mobile});
            
            detected = await checkIfDetected(page, 'Bloomberg');
            // If detected, sleep for a random time between 5 and 15 min
            // This is useful to deal with the cases in which different scrapers
            //  on the same network scrapes the SBIR/Bloomberg pages too fastly
            if (detected) {
              console.log('Wait for 10m and try again');
              await sleepFor(10*60*1000);
            }
          } while (detected);
          
          try {
            await page.waitForSelector(resultsSelector, 
                                       { timeout: 10000 });
            const infoTab_keys = await page.$$eval(`h2[class^=\'infoTableItemLabel\']`, 
                                                    els => els.map(el => el.innerText));
            const infoTab_values = await page.$$eval(`div[class^=\'infoTableItemValue\']`, 
                                                     els => els.map(el => el.innerText))
                                                     .then(els => els.map(el => {
                                                       if (!el || el==='--') return null;
                                                       return el;
                                                     }));
            const infoTab = await Object.assign(...infoTab_keys.map((k, i) => {
              return ({ [k]: infoTab_values[i] });
            }));
            var url = await infoTab['WEBSITE'];
          } catch(e) {
            console.error(chalk.red(`Error: ${e}`));
            var url = 'ERROR';
          }
          
          var skipped = false;
           
          if (!useHeadless) await sleepFor(15000);
          await page.close();
        } else {
          console.log(chalk.blue(
            `${chalk.bold('Bloomberg page skipped because not US-based-> ')}${url}`));
          var url = null;
          var skipped = true;
        }
        
        return [url, skipped];
      }
    }
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
  }
}

/****************/
/*   SCRAPERS   */
/****************/

async function scrapeWebsites(browser, {who, where, how, mobile}) {
  let whereDomain = {
    'SBIR':['site:sbir.gov/sbc'],
    'Bloomberg':['site:bloomberg.com/profile/company'],
    'Anywhere':[
      '-site:gov',
      '-site:edu',
      '-site:mil',
      '-site:int',
      // '-site:sbir.gov',
      '-site:bloomberg.com']
  }[where]
  whereDomain = whereDomain.join(' ');
  let query = `${who} ${whereDomain}`;
  query = query.split(' ').join('+');
  
  let msg;
  if (where==='Anywhere') {
    msg = `Looking for the website of ${who} on ${how}`;
  } else {
    msg = `Looking for ${where} pages of ${who} on ${how}`;
  }
  switch (how) {
    case 'Google': 
      var SEResults = await searchOnGoogle(
        browser, {query:query, msg:msg, mobile:mobile});
      break;
    case 'Bing': 
      var SEResults = await searchOnBing(
        browser, {query:query, msg:msg, mobile:mobile});
      break;
    case 'SBIR': 
      var SEResults = await searchOnSBIR(
        browser, {query:query, msg:msg, mobile:mobile});
      break;
  }
  
  if (where==='Anywhere') {
    // console.log(SEResults);
    return SEResults;
  }
  let detectedResults = [null];
  try {
    let nScraped = 0;
    for await (const [idx, SEResult] of SEResults.entries()) {
      if (SEResult) {
        
        // TODO Reuse value of previous queries 
        //  when the same business name appears again
        
        let assertion = whereDomain.replace('site:','');
        assertion = `^https?://www.${assertion}/`;
        assert(SEResult.match(assertion));
        
        const [url, skipped] = await scrapeURL(browser, {url:SEResult, mobile:mobile});
        
        detectedResults.push(url);
        
        if (idx < SEResults.length - 1 && !skipped) {
          // Wait for (on average) at least 30 sec and no more than 2 min 
          //  on each iteration. The waiting time increases at each step 
          //  with the idea that if you find a few pages then you will already 
          //  wait for some time before the next outer-loop iteration. 
          //  While, if you have many inner-loop iterations, you must wait 
          //  for longer already here to avoid being detected
          nScraped += 1;
          const msSleep = randomSleep(15, 45) * Math.min(Math.max(1, nScraped/2), 4);
          await sleepFor(msSleep);
        }
        
      } else {
        console.log(chalk.blue.bold(`No ${where} page to scrape`));
      }
    }
    
    // console.log(detectedResults);
    
    return detectedResults;
    
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
    return ['ERROR'];
  }
}

async function scrapeVPMPages(browser, {who, where, how, mobile, maxExpResults}) {
  const query = await who.split(' ').join('+');
  
  let msg = who.match(/\((?<websites>.+)\) AND \((?<patents>.+)\)/);
  msg = `Looking into ${msg.groups['websites']} ` +
        `for any of the identified patents (${msg.groups['patents'].split(' OR ').join(', ')}) ` +
        'through Google';
  
  // query = await query.split(' ').join('+');
  // query = await `https://www.google.com/search?gl=us&hl=en&num=10&q=${query}`;
  
  try {
    const detectedResults = await searchOnGoogle(
      browser, 
      {query:query, 
       msg:msg, 
       mobile:mobile, 
       maxExpResults:maxExpResults});
    
    // console.log(detectedResults);
    
    return detectedResults;
    
  } catch(e) {
    console.error(chalk.red(`Error: ${e}`));
    return ['ERROR'];
  }
}

/***************/
/*   EXPORTS   */
/***************/

module.exports = { 
  getDataAlreadyScraped, 
  isAlreadyScraped, 
  getOrganizations, 
  cleanURL, 
  randomSleep, 
  printMsAsMinAndSec, 
  sleepFor, 
  scrapeWebsites, 
  scrapeVPMPages 
};
