var objA, objB, objC;

objA = {
    func: function() {
      console.log('hi');
    }
};

objB = {ref: objA};
objB.ref.func();
