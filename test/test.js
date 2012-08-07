var should = require('should');

/**
 * Module dependencies.
 */

var eliminator = require('../eliminator.js')
  , fs = require('fs');

// test cases

var cases = fs.readdirSync('test/cases').filter(function(file){
  return ~file.indexOf('.js');
}).map(function(file){
  return file.replace('.js', '');
});

cases.forEach(function(test){
  var name = test.replace(/[-.]/g, ' ');
  it(name, function(){
    var path = 'test/cases/' + test + '.js';
    var str = fs.readFileSync(path, 'utf8');
    var js = fs.readFileSync('test/cases/' + test, 'utf8').trim().replace(/\r/g, '');
    var actual = eliminator.eliminate(str);
    actual.trim().should.equal(js);
  })
});
