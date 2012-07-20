var fs = require('fs');
var parse = require('esprima').parse;
//var path = 'test/cases/assignment-expression.function-expression.js';
var path = 'example.js';
var file = fs.readFileSync(path, 'ascii');

var tree = parse(file, {range: false});

console.log(JSON.stringify(tree, null, '  '));

