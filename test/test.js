var should = require('should');
var walker = require('../walk.js');
describe('Walker', function(){
    describe('#graphify()', function(){
        it('should return the modified source code', function(){
            walker.eliminate('example.js').should.be.a('string');
        })
    })
})
