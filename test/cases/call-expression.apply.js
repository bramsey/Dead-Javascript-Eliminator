foo = 'bar';
var obj = { foo: 'foo' };
var test = function() {
    console.log(this.foo);
};

test.apply(obj);
