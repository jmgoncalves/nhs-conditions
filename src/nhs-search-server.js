/** File: nhs-search-server.js
 * API that indexes nhs-conditions.json using nlp_compromise and uses it to
 * process NPL queries, redirecting the user to the most appropriate page.
 *
 * Authors:
 *   - jmgoncalves
 */


/**
 *  REQUIRES
 */

var http = require('http');
var url = require('url');
var fs = require('fs');
var nlp = require('nlp_compromise');

/**
 *  CONSTANTS
 */

var PROCESS_NAME = 'nhs-search-server';
var DEFAULT_PORT = 1337;
var DEFAULT_OUTPUT_FILE = 'nhs-conditions.json';
var USAGE_MESSAGE = 'Usage: http://localhost/?q=<question> (e.g. http://localhost/?q=what are the symptoms of cancer?)';
var DEFAULT_URL = 'http://www.nhs.uk/Conditions/Pages/hub.aspx';

/**
 *  SEACRCH FUNCTIONS
 *
 *  TODO
 */

 /** Variable: index
  *	 Object containing a map of all detected nouns in the database and associated (weighed) objects
	*  index[term][url] = score
  */
var index = {};

/** Function: indexData
 *	Main indexing function
 *
 *  Parameters:
 *   (Object) obj -
 */
var indexData = function(obj, subpgType) {
	if (obj.keywords === undefined)
		obj.keywords = '';

	// index keywords and subpage type
	var subpgTypeAdded = false;
	var kw = obj.keywords.split(',');
	for (var i=1; i<kw.length; i++) {
		indexText(kw[i], obj.url);
		if (kw[i].toLowerCase()===subpgType)
			subpgTypeAdded = true;
	}
	if (!subpgTypeAdded)
		indexText(subpgType, obj.url);

	// index text
	indexText(obj.text, obj.url);
};

/** Function: indexText
 *	Take some text get noun terms and subterms and index them
 *  Weight of terms is assigned inversely to their total quantity in the text
 *
 *  Parameters:
 *   (String) text -
 *   (String) url -
 */
var indexText = function(text, url) {
	var terms = nlp.text(text).terms();
	for (var t in terms) {
		if (terms[t].pos.Noun) {
			var term = nlp.noun(terms[t].text.toLowerCase()).root();
			updateIndex(term, url, 1/terms.length);
			var subTerms = term.split(' ');
			for (var st in subTerms) {
				updateIndex(subTerms[st], url, 1/terms.length/subTerms.length);
			}
		}
	}
};

/** Function: updateIndex
 *	Updates index for the given term, url and weight
 *
 *  Parameters:
 *   (String) term -
 *   (String) url -
 *   (int) weight -
 */
var updateIndex = function(term, url, weight) {
	if (index[term]===undefined)
		index[term] = {};
	if (index[term][url]===undefined)
		index[term][url] = weight;
	else
		index[term][url] += weight;
};

 /** Function: getTopMatch
	*	 Get top url match for a set of query nouns
	*
	*  Parameters:
	*   (String) queryNouns -
	*  Returns:
  *   (String) best url
	*/
var getTopMatch = function(queryNouns) {
	var scores = {};
  for (var n in queryNouns) {
		for (var u in index[queryNouns[n]]) {
			if (scores[u]===undefined)
				scores[u] = index[queryNouns[n]][u];
			else
				scores[u] += index[queryNouns[n]][u];
		}
	}

	var topScore = -1;
	var topResult = undefined;
	for (var u in scores) {
		if (scores[u]>topScore) {
			topScore = scores[u];
			topResult = u;
		}
	}

	if (topScore>-1)
		return topResult;
	return DEFAULT_URL;
};

 /** Function: getNouns
  *	 Get nouns from query question
  *
  *  Parameters:
  *   (String) question -
	*  Returns:
  *   (Array) nouns contained in question
  */
var getNouns = function(question) {
	var nouns = [];
	var terms = nlp.sentence(question).terms;

	for (var i = 0; i < terms.length; i++) {
		if (terms[i].pos.Noun)
			nouns.push(terms[i].root());
	}

	return nouns;
};

/**
 *  MAIN
 *
 *  Main part of the application, where the main HTTP server function and the application intialization are defined
 */

/** Function: main
 *  Handles incomming requests, calls the logic function and responds
 *
 *  Parameters:
 *   (http.IncomingMessage) req - Incomming request to be handled
 *   (http.ServerResponse) res - Response to be returned
 */
var main = function (req, res) {
	timestampsDate = new Date();
	console.log('['+timestampsDate.toISOString()+'] Received '+req.url+' request from '+req.connection.remoteAddress);

	var questionQuery = url.parse(req.url).query;

	if (questionQuery!==null && questionQuery.startsWith('q=')) {
		var question = decodeURI(questionQuery.substring(2));
		var redirectUrl = getTopMatch(getNouns(question));
		res.writeHead(302, {
		 'Location': redirectUrl
		});
		res.end();
	} else {
		res.writeHead(200);
		res.end(USAGE_MESSAGE);
	}
};

/** Application Init
 *
 *  Renames process
 *  Aquires port and file settings from arguments
 *  Loads and enriches database
 *  Starts listening for HTTP requests
 *  Outputs configuration
 */

process.title = PROCESS_NAME;

var timestampsDate = new Date();

var port = DEFAULT_PORT;
if (process.argv.length>2) {
	port = parseInt(process.argv[2],10);
	if (isNaN(port)) {
		port = DEFAULT_PORT;
		console.log('['+timestampsDate.toISOString()+'] Bad port supplied: "'+process.argv[2]+'" - using default...');
	}
}

var file = DEFAULT_OUTPUT_FILE;
if (process.argv.length>3) {
	file = process.argv[3];
}

var jsonDatabase = {};

fs.readFile(file, 'utf8', function (err,data) {
	timestampsDate = new Date();

	if (err) {
		console.log('['+timestampsDate.toISOString()+'] Unable to read file '+file+' ...');
    return;
  }

	// load and enrich data
	console.log('['+timestampsDate.toISOString()+'] Loading and indexing data from '+file+' ...');
  jsonDatabase = JSON.parse(data);
	for (var p in jsonDatabase) {
		indexData(jsonDatabase[p],'introduction');

		for (var s in jsonDatabase[p].subpages) {
			indexData(jsonDatabase[p].subpages[s],s);
		}
	}

	http.createServer(main).listen(port);
	console.log('['+timestampsDate.toISOString()+'] Server running at port '+port+'...');
});
