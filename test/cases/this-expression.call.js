var obj = { foo: 'foo' };
var foo = 'bar';

function test() {
    console.log(this.foo);
}

test.call(obj);
