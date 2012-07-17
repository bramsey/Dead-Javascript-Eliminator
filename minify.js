var fs = require('fs');
var parse = require('esprima').parse;

var file = fs.readFileSync('example.js', 'ascii');

var tree = parse(file, {range: false});

console.log(JSON.stringify(tree, null, '  '));

