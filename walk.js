(function () {
    
    var fs = require('fs');
    var _ = require('underscore');
    var parse = require('esprima').parse;

    var file = fs.readFileSync('example.js', 'ascii');


    var tree = parse(file, {range: true, loc: true});

    var result = {
        chunks : file.split(''),
        toString : function () { return result.chunks.join('') },
        inspect : function () { return result.toString() }
    };

    var insertHelpers = function(node, parent) {
        if (!node.range || node.parent) return;

        node.parent = parent;

        node.source = function () {
            return result.chunks.slice(
                node.range[0], node.range[1] + 1
            ).join('');
        };

        node.update = function (s) {
            result.chunks[node.range[0]] = s;
            for (var i = node.range[0] + 1; i < node.range[1] + 1; i++) {
                result.chunks[i] = '';
            }
        };
    };

    // walk up the tree until the closest declaration is found then remove it.
    var removeDeclaration = function(node) {
        if (!node) {
            return;
        } else if (node.type && node.type === 'VariableDeclarator') {
            if (node.parent.declarations.length === 1) {
                console.log('deleted: ' + node.id.name);
                node.parent.update(''); // remove parent if only declarator.
            } else {
                console.log('deleted: ' + node);
                node.update('');
            }
        } else if (node.type && node.type === 'FunctionDeclaration') {
            console.log('deleted: ' + node.id.name);
            node.update('');
        } else {
            removeDeclaration(node.parent);
        }
        return;
    };

    var walk = function(node, parent, action) {
        insertHelpers(node, parent);
        if (action) action(node);
        for (var key in node) {
            if (key === 'parent') return;
        
            var child = node[key];
            if (child instanceof Array) {
                for (var i=0, l=child.length; i<l; i++) {
                    if (child[i] && typeof child[i] === 'object' && child[i].type) {
                        walk(child[i], node, action);
                    }
                }
            } else if (child && typeof child === 'object' && child.type) {
                insertHelpers(child, node);
                walk(child, node, action);
            }
        }
    };

    var deleteWalk = function(node) {

        if(node.type && 
            (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') &&
            !node.visited) {
                removeDeclaration(node);
        }
    };
    
    var affectsScope = function(type) {
        switch(type) {
            case 'Program':
                return true;
            case 'FunctionDeclaration':
                return true;
            case 'FunctionExpression':
                return true;
                break;
        }
        return false;
    };
    
    // find the nearest stack by walking up the tree.
    var getStack = function(node, path) {
        if (!node) {
            return;
        } else if (node.stack) {
            return node.stack;
        } else {
            return getStack(path.pop(), path);
        }
    };
    
    // find the specified reference in the scoped stack hierarchy.
    var getReference = function(node, name, path) {
        if (!node) return;
        if (node.stack && node.stack[name]) {
            return node.stack[name];
        } else {
            return getReference(path.pop(), name, path);
        }
    };
    
    // Turn the ast into a directed graph.
    // path: array representing previously visited nodes.        
    var graphify = function(node, path) {
        if (!node.range || node.visited) return;
        
        if (affectsScope(node.type)) {
            node.stack = node.stack || {};
        }
        
        if (node.type === 'VariableDeclaration') {
            var stack = getStack(path[path.length-1], path.slice(0));
            _.each(node.declarations, function(declarator) {
                stack[declarator.id.name] = declarator.init;
            });
            return;
        } else if (node.type === 'FunctionDeclaration') {
            var stack = getStack(path[path.length-1], path.slice(0));
            stack[node.id.name] = node.body;
            return;
        } else if (node.type === 'Identifier') {
            if (node.parent.type === 'Property') return;
            var reference = getReference(path[path.length-1], node.name, path.slice(0));
            if (reference) { 
                graphify(reference, path.slice(0));
            } else {
                console.log('reference not found: ' + node.name);
                return; // Only gets here if a reference wasn't found.
            }
        } else {
            node.visited = true;
            //console.log('visited: ' + node.type + ' | ' + node.id);
            if (node.type === 'BlockStatement' && node.parent &&
                    node.parent.type === 'FunctionDeclaration') {
                node.parent.visited = true;
            }
            for(var key in node) {
                if (key === 'parent') return;
                
                var child = node[key];
                if (child instanceof Array) {
                    for (var i=0, l=child.length; i<l; i++) {
                        if (child[i] && typeof child[i] === 'object' && child[i].type) {
                            graphify(child[i], path.concat(node));
                        }
                    }
                } else if (child && typeof child === 'object' && child.type) {
                    graphify(child, path.concat(node));
                }
            }
        }
    };
   
    walk(tree, undefined);
    graphify(tree, [], 0);
    
    walk(tree, undefined, deleteWalk);
    //console.log('\n\n\n\n\n');
    
    //console.log(tree.body[0].expression.callee);
    
    console.log('\n\n');

    //tree.body[1].update('')
    //console.log(result.toString().trim());
})();
