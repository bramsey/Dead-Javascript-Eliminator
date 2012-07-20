var fs = require('fs');
var parse = require('esprima').parse;

var file = fs.readFileSync('test/cases/assignment-expression.function-expression.js', 'ascii');

var tree = parse(file, {range: false});

console.log(JSON.stringify(tree, null, '  '));

