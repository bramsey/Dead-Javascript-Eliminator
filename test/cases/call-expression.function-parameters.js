var a = 1, param = 'delete me';

function b(param) {
    console.log(param);
}

b.apply(this, [a]);
