var should = require('should');
describe('Walker', function(){
    describe('#graphify()', function(){
        it('should return the modified source code', function(){
            var walker = require('../walk.js');
            should.exist(walker);
        })
    })
})
