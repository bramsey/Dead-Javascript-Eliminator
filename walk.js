(function(exports) {
var eliminate = exports.eliminate = function(fileContents) {
    
    // TODO: write each method if that's all I use from underscore.
    var _ = require('underscore');
    var parse = require('esprima').parse;

    var file = fileContents || '';


    // build the ast with esprima.
    var tree = parse(file, {range: true});

    var result = {
        chunks : file.split(''),
        toString : function () { return result.chunks.join('') },
        inspect : function () { return result.toString() }
    };

    // Used to insert helpers during  the ast walk.
    var insertHelpers = function(node, parent) {
        if (!node.range || node.parent) return;

        node.parent = parent; // reference to parent node.
        
        // returns the current source for the node.
        node.source = function () {
            return result.chunks.slice(
                node.range[0], node.range[1] + 1
            ).join('');
        };

        // updates the source for the node.
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

    /**
     * Generic walk function
     * @action: function to be applied to the node in order.
     */
    var walk = function(node, parent, action) {
        insertHelpers(node, parent);
        if (action) action(node);

        for (var key in node) {
            if (key === 'parent') return;
        
            var child = node[key];
            if (child instanceof Array) {
                for (var i=0, l=child.length; i<l; i++) {
                    if (child[i] && typeof child[i] === 'object' && 
                            child[i].type) {
                        walk(child[i], node, action);
                    }
                }
            } else if (child && typeof child === 'object' && child.type) {
                insertHelpers(child, node);
                walk(child, node, action);
            }
        }
    };

    // Checks if the node type affects scope.
    var affectsScope = function(type) {
        switch(type) {
            case 'Program':
            case 'FunctionDeclaration':
            case 'FunctionExpression':
            case 'ObjectExpression':
                return true;
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

    var getStackWithReference = function(node, ref, path) {
        if (!node) {
            return;
        } else if (node.stack && node.stack[ref]) {
            return node.stack;
        } else {
            return getStackWithReference(path.pop(), ref, path);
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
        
        // Visit nodes based on type.
        if (node.type === 'VariableDeclaration') {
            var stack = getStack(path[path.length-1], path.slice(0));
            _.each(node.declarations, function(declarator) {
                stack[declarator.id.name] = declarator.init;
            });
            return;
        } else if (node.type === 'AssignmentExpression') {
            if (node.operator === '=') {
                var stack = getStackWithReference(path[path.length-1], 
                        node.left.name,
                        path.slice(0)) ||
                        getStack(path[path.length-1], path.slice(0));
                stack[node.left.name] = node.right;
            }
        } else if (node.type === 'FunctionDeclaration') {
            var stack = getStack(path[path.length-1], path.slice(0));
            stack[node.id.name] = node.body;
            return;
        } else if (node.type === 'Identifier') {
            var reference = getReference(path[path.length-1], 
                    node.name, path.slice(0));
            if (reference) { 
                graphify(reference, path.slice(0));
            } else {
                console.log('reference not found: ' + node.name);
                return; // Only gets here if a reference wasn't found.
            }
        } else if (node.type === 'ObjectExpression') {
            var stack = node.stack;
            for(var key in node) {
                var child = node[key];
                if (child instanceof Array) {
                    for (var i=0, l=child.length; i<l; i++) {
                        if (child[i] && typeof child[i] === 'object' && 
                                child[i].type) {
                            stack[child[i].key.name || child[i].key.value] = 
                                child[i].value;
                        }
                    }
                }
            }
        } else if (node.type === 'MemberExpression') {
            var reference = getReference(path[path.length-1], 
                    node.object.name, path.slice(0));
            if (reference) {
                // populate stack for object if the stack is empty.
                if (!reference.stack[node.property.name]) graphify(reference);
                reference.visited = true;
                graphify(reference.stack[node.property.name || 
                        node.property.value], path.slice(0));
            } else {
                console.log('reference not found: ' + node.name);
                return; // Only gets here if a reference wasn't found.
            }

        } else {
            node.visited = true;

            // flags referenced function declarations as visited.
            if (node.type === 'BlockStatement' && node.parent &&
                    node.parent.type === 'FunctionDeclaration') {
                node.parent.visited = true;
            }

            // TODO: abstract this walking for the generic case.
            for(var key in node) {
                if (key === 'parent') return;
                
                var child = node[key];
                if (child instanceof Array) {
                    for (var i=0, l=child.length; i<l; i++) {
                        if (child[i] && typeof child[i] === 'object' && 
                                child[i].type) {
                            graphify(child[i], path.concat(node));
                        }
                    }
                } else if (child && typeof child === 'object' && child.type) {
                    graphify(child, path.concat(node));
                }
            }
        }
    };
   
    // Pass to initialize helpers and stacks.
    walk(tree, undefined, function(node) {
        if (node.type && affectsScope(node.type)) {
            node.stack = node.stack || {'stackType': node.type};
        }
    });
    
    graphify(tree, [], 0);
    
    /**
     * Pass to delete unused functions.
     * unvisited functions are assumed to be unused.
     */
    walk(tree, undefined, function(node) {
        if (node.type && 
            (node.type === 'FunctionExpression' || 
             node.type === 'FunctionDeclaration' ||
             node.type === 'ObjectExpression') &&
            !node.visited) {
                removeDeclaration(node);
        }
    });
    
    console.log('');
    //console.log(result.toString().trim()); // output result source.
    return result.toString().trim();
};
})(typeof exports === 'undefined' ? (eliminator = {}) : exports);
