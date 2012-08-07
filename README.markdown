# Javascript Dead Code Eliminator

A tool to statically analyze javascript and remove unused code.
Given a string of isolated javasciprt code, it should eliminate most code
that does not get used.

## Requirements

The eliminator uses the following libraries:
- [esprima](https://github.com/ariya/esprima)
- [underscore.js](https://github.com/documentcloud/underscore/)
- [mocha](https://github.com/visionmedia/mocha) for running tests

## Installation

1. Clone this repository
2. install the requirements with npm

## How to use

1. Require eliminator.js
2. Call the eliminate method with a string of your full application source
3. Use the resulting string with dead code eliminated as you see fit.

## Example use

```js
var eliminator = require('./eliminator.js'),
    fs = require('fs'),
    file = fs.readFileSync('example.js', 'ascii'),
    result = eliminator.eliminate(file);

fs.writeFile('example.eliminated.js', result);
```

## Disclaimer

This tool is still being refined. Using certain javascript constructs may
result in returning broken code.  I would recommend never overwriting existing
code with eliminated code. Please use thorough test coverage to ensure the 
result works as expected.

If you find anything else that breaks, new test cases are always appreciated.

Some javascript constructs to avoid using:
- eval()
- with()

## License

(The MIT License)

Copyright (c) 2012 Bill Ramsey

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the 'Software'), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
