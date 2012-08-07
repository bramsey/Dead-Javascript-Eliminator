var obj = {
    a: 1,
    one: function() {
        return 1;
    },
    two: function() {
        return a;
    }
};

console.log(obj.two());
