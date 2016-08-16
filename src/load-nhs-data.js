/** File: Load-nhs-data.js
 * Scraps http://www.nhs.uk/Conditions/Pages/hub.aspx and the conditions
 * sub-pages to create the nhs-conditions.json file that serves as database for
 * the API requests handled by nhs-search-server.js
 *
 * Authors:
 *   - jmgoncalves
 */


/**
 *  REQUIRES
 */

var http = require('http');
var url = require('url');
var cheerio = require('cheerio');
var fs = require('fs');

/**
 *  CONSTANTS
 */

var PROCESS_NAME = 'load-nhs-data';
var DEFAULT_OUTPUT_FILE = 'nhs-conditions.json';
var MAIN_PAGE = 'http://www.nhs.uk/Conditions/Pages/hub.aspx';
var DELAY = 2000;

/**
 *  HTTP HELPER FUNCTIONS
 *
 *  Functions for help querying the NHS website
 */

/** Function: buildRequestOptions
 *  Builds the http.request options object for the target URL, taking in account
 *  proxy settings
 *
 *  Parameters:
 *   (String) targetUrl - target URL, enconding the endpoint of the HTTP request
 *  Returns:
 *   (Object) options object for sending an HTTPS request to the target URL
 */
var buildRequestOptions = function(targetUrl) {
	var parsedUrl = url.parse(targetUrl);

	var request = {
		headers: {'User-Agent': PROCESS_NAME},
		method: 'GET',
		hostname: parsedUrl.hostname,
		path: parsedUrl.path
	}

	return request;
};

/** Function: doRequest
 *  Requests an endpoint via HTTP and calls the callback function with the response data as parameter
 *
 *  Parameters:
 *   (Object) requestOptions - options object, describing the endpoint of the HTTPS request
 *   (Function) callback - function to handle the HTTPS response data
 */
var doRequest = function(requestOptions, callback) {
	var req = http.request(requestOptions, function(res) {
	  res.setEncoding('utf8');
	  var responseData = '';

		res.on('data', function (chunk) {
	    responseData = responseData + chunk;
	  });

	  res.on('end', function () {
			requestCounter--;
			callback(responseData);
	  });
	});

	req.on('error', function(e) {
		requestCounter--;
		timestampsDate = new Date();
		console.log('['+timestampsDate.toISOString()+'] ERROR: request to '+requestOptions.path+' failed: '+e.message);
	});

  req.end();
};

/**
 *  SCRAPING HELPER FUNCTIONS
 *
 *  Functions to help scraping page info
 */

 /** Function: getScraper
  *	 TODO
  *
  *  Parameters:
  *   (String) pUrl -
  *  Returns:
  *   (Object) scrpper function for the page
  */
var getScraper = function(pUrl) {
	var i = pUrl.lastIndexOf('?');
	var pg = pUrl.substring(pUrl.lastIndexOf('/'),((i>0) ? i : pUrl.length));

	if (scrapers[pg]!==undefined)
		return scrapers[pg];
	return defaultScraper;
};

/** Variable: scrapers
 *  Object containing all scrapers for different pages
 */
 var scrapers = {};

 /** Function: scrapers['/hub.aspx']
  *  TODO
  *
  *  Parameters:
  *   (String) pageUrl -
	*   (Object) json -
  *   (Function) callback -
	*   (Object) $ -
  */
 scrapers['/hub.aspx'] = function (pageUrl, json, callback, $) {
	 var pageBaseUrl = 'http://www.nhs.uk/Conditions/Pages/';

 		$('div#haz-mod1 a').each(function(index){
 			scrapePageDelay(pageBaseUrl+$(this).attr('href'),json, callback, index);
 		});
 };

 /** Function: scrapers['/BodyMap.aspx']
	*  TODO
	*
	*  Parameters:
	*   (String) pageUrl -
	*   (Object) json -
  *   (Function) callback -
	*   (Object) $ -
	*/
 scrapers['/BodyMap.aspx'] = function (pageUrl, json, callback, $) {
	 var pageBaseUrl = 'http://www.nhs.uk';
	 var introPage = '/Pages/Introduction.aspx';

	 $('div#haz-mod5 a').each(function(index){
		 var conditionPage = $(this).attr('href');
		 if (conditionPage!==undefined) {
			 if (conditionPage.indexOf('/')==0) {
				 scrapePageDelay(pageBaseUrl+conditionPage+introPage, json, callback, index);
			 } else if (conditionPage.indexOf('http://')==0) {
				 scrapePageDelay(conditionPage, json, callback, index);
			 }
		 }
	 });
 };

 /** Function: scrapers['/Introduction.aspx']
 *  TODO
 *
 *  Parameters:
 *   (String) pageUrl -
 *   (Object) json -
 *   (Function) callback -
 *   (Object) $ -
 */
 scrapers['/Introduction.aspx'] = function (pageUrl, json, callback, $) {
	var pageBaseUrl = 'http://www.nhs.uk';
	var titleSpan = $('ul.sub-nav span.active-text');
	titleSpan.find('span.hidden').remove(); // invisible text is sometimes present
	var title = titleSpan.text().trim();

	var text = '';
	$('div.main-content p').each(function(){
		text = text + $(this).text().trim() + ' ';
	});

	json[title] = {
		'title': title,
		'url': pageUrl,
		'keywords': $("meta[name='keywords']").attr('content'),
		'text': text,
		'subpages': {}
	};

	$('ul.sub-nav a').each(function(index){
		var subPage = $(this).attr('href');
		scrapePageDelay(pageBaseUrl+subPage, json, callback, index);
	});
};

/** Function: scrapers['/Symptoms.aspx']
*  TODO
*
*  Parameters:
*   (String) pageUrl -
*   (Object) json -
*   (Function) callback -
*   (Object) $ -
*/
scrapers['/Symptoms.aspx'] = function (pageUrl, json, callback, $) {
	var titleLink = $($('ul.sub-nav a')[0]);
	titleLink.find('span.hidden').remove(); // invisible text is sometimes present
	var title = titleLink.text().trim();
	var subpageType = pageUrl.substring(pageUrl.lastIndexOf('/')+1,pageUrl.lastIndexOf('.')).toLowerCase();

	if (json[title]===undefined) {
	 timestampsDate = new Date();
	 console.log('['+timestampsDate.toISOString()+'] WARNING: Failed to find existing title for "'+pageUrl+'"! Skipping...');
	 return;
	}

	var text = '';
	$('div.main-content p').each(function(){
	text = text + $(this).text().trim() + ' ';
	});

	json[title].subpages[subpageType] = {
	 'url': pageUrl,
	 'keywords': $("meta[name='keywords']").attr('content'),
	 'text': text
	};
};

// Assign other page scrapers to the one of Symptoms
scrapers['/Causes.aspx'] = scrapers['/Symptoms.aspx'];
scrapers['/Diagnosis.aspx'] = scrapers['/Symptoms.aspx'];
scrapers['/Treatment.aspx'] = scrapers['/Symptoms.aspx'];
scrapers['/Complications.aspx'] = scrapers['/Symptoms.aspx'];
scrapers['/Prevention.aspx'] = scrapers['/Symptoms.aspx'];

/** Function: defaultScraper
 *  Tries to get title, keywords and all text content
 *
 *  Parameters:
 *   (String) pageUrl -
 *   (Object) json -
 *   (Function) callback -
 *   (Object) $ -
 */
var defaultScraper = function (pageUrl, json, callback, $) {
	var title = $("meta[name='DC.title']").attr('content');
	if (title===undefined)
		title = pageUrl;
	else
		title = title.trim();

	var text = '';
	$('p').each(function(){
		text = text + $(this).text().trim() + ' ';
	});

	json[title] = {
		'title': title,
		'url': pageUrl,
		'keywords': $("meta[name='keywords']").attr('content'),
		'text': text,
		'subpages': {}
	};
};

 /**
  *  MAIN FUNCTIONS
  *
  *  Main part of the application
  */

/** Function: scrapePage
 *  Build request, send request, build cheerio object, and pass everything to
 *  scraper. If no request is pending, execute the callback.
 *
 *  Parameters:
 *   (String) pageUrl -
 *   (Object) json -
 *   (Function) callback -
 */
var scrapePage = function (pageUrl, json, callback) {
	var requestOptions = buildRequestOptions(pageUrl);
	doRequest(requestOptions, function(responseData) {
		getScraper(pageUrl)(pageUrl, json, callback, cheerio.load(responseData));
		if (requestCounter == 0)
			callback(json);
	});
};

/** Function: scrapePageDelay
 *  Wrapper to scrapePage that limits the requests speed so that the NHS site
 *  does not blacklist the IP
 *
 *  Parameters:
 *   (String) pageUrl -
 *   (Object) json -
 *   (Function) callback -
 */
var scrapePageDelay = function (pageUrl, json, callback, reqIndex) {
	requestCounter++;
	setTimeout(scrapePage, DELAY*(reqIndex+1), pageUrl, json, callback);
};

/** Application Init
 *
 *  Renames process
 *  Aquires file from arguments
 *  Triggers scraping and writes result to file
 */

process.title = PROCESS_NAME;

var timestampsDate = new Date();

var file = DEFAULT_OUTPUT_FILE;
if (process.argv.length>2) {
	file = process.argv[2];
}

console.log('['+timestampsDate.toISOString()+'] Starting to scrap the NHS conditions page and writing the output to '+file+'...');
var requestCounter = 0;
scrapePageDelay(MAIN_PAGE, {}, function(json){
	fs.writeFile(file, JSON.stringify(json), function (err) {
	  if (err) {
	    return console.log(err);
	  }
		timestampsDate = new Date();
	  console.log('['+timestampsDate.toISOString()+'] Wrote output to '+file+'! Quitting...');
	});
},-1);
