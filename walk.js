(function(exports) {
var _ = require('underscore'),
    parse = require('esprima').parse,
    result,
    tree;

var stringify = function(node, tab, indent) {
    var output = '';
    for (var key in node) {
        if (key === 'parent' || key === 'source' || key === 'destroy') continue;

        var child = node[key];
        if (child instanceof Array) {
            if (key === 'range') {
                output += indent + key + ': ' + child[0] + ' - ' + child[1] + '\n';
            } else {
                output += indent + key + ':\n';
                for (var i=0, l=child.length; i<l; i++) {
                    if (child[i] && typeof child[i] === 'object' &&
                            child[i].type) {
                        output += stringify(child[i], tab, indent+tab);
                    }
                }
            }
        } else if (child && typeof child === 'object') {
            output += indent + key + ':\n';
            output += stringify(child, tab, indent+tab);
        } else if (child && typeof child === 'string' ||
                            typeof child === 'number' ||
                            typeof child === 'boolean') {
            output += indent;
            if (key === 'type') {
                output += child + '\n';
                indent += tab;
            } else {
                output += key + ': ' + child + '\n';
            }
        }
    }
    return output;
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

// Used to insert helpers during  the ast walk.
var insertHelpers = function(node, parent) {
    if (!node.range || node.parent) return;

    // reference to parent node.
    node.parent = parent;

    // initialize scopes
    if (affectsScope(node.type)) node.scope = node.scope || {};

    // returns the current source for the node.
    node.source = function() {
        return result.chunks.slice(
            node.range[0], node.range[1] + 1
        ).join('');
    };

    // deletes the source for the node.
    node.destroy = function() {
        for (var i = node.range[0]; i < node.range[1] + 1; i++) {
            result.chunks[i] = '';
        }
    };
};

/**
 * Generic walk function
 * @action: function to be applied to the node in order.
 */
var walk = function(node, parent, action, path) {
    var shouldWalk;
    path = path || [];
    insertHelpers(node, parent);

    shouldWalk = action ? action(node, path) : true;
    if (!shouldWalk) return;

    for (var key in node) {
        if (key === 'parent') continue;

        var child = node[key];
        if (child instanceof Array) {
            for (var i=0, l=child.length; i<l; i++) {
                if (child[i] && typeof child[i] === 'object' &&
                        child[i].type) {
                    walk(child[i], node, action, path.concat(node));
                }
            }
        } else if (child && typeof child === 'object' && child.type) {
            walk(child, node, action, path.concat(node));
        }
    }
};

// walk up the tree until the closest declaration is found then remove it.
// TODO: refactor to use a deletor similar to visitor pattern.
var removeDeclaration = function(node) {
    if (node.type === 'VariableDeclarator') {
        if (node.parent.declarations.length === 1) {
            console.log('deleted: ' + node.id.name);
            node.parent.destroy(); // remove parent if only declarator.
        } else {
            console.log('deleted: ' + node);
            node.destroy();
        }
    } else if (node.type === 'AssignmentExpression') {
        console.log('deleted: ' + node.left.name);
        node.parent.destroy();
    } else if (node.type === 'FunctionDeclaration') {
        console.log('deleted: ' + node.id.name);
        node.destroy();
    } else {
        if (node.parent) removeDeclaration(node.parent);
    }
    return;
};

// find the nearest scope by walking up the tree.
var getScope = function(node, path) {
    if (!node) return;
    return node.scope ? node.scope : getScope(path.pop(), path);
};

// find the nearest scope with the specified reference.
var getScopeWithReference = function(node, ref, path) {
    if (!node) return;

    if (ref.type === 'MemberExpression') {
        var obj = getReference(node, ref.object.name, path.slice(0));
        obj.visited = true;// TODO: this belongs someplace else probably
        return obj ? obj.scope : undefined;
    }

    if (node.scope && node.scope[ref.name || ref.value]) {
        node.visited = true;
        return node.scope;
    } else {
        getScopeWithReference(path.pop(), ref, path);
    }
};

// find the specified reference in the scoped scope hierarchy.
var getReference = function(node, name, path) {
    if (!node) return;
    return (node.scope && node.scope[name]) ?
        node.scope[name] :
        getReference(path.pop(), name, path);
};

var visit = function(node) {
    if (!node) return;
    node.visited = true;

    switch (node.type) {
        case 'ExpressionStatement':
        case 'VariableDeclaration':
        case 'FunctionDeclaration':
            return;
        default:
            visit(node.parent);
            break;
    }
};

var visitor = {
    /*
    Program: function(node) {
        // Affects scope
        for(var i=0, l=node.body.length; i < l; i++) {
            walk(node.body[i]);
        }
    },

    // Statements
    //EmptyStatement: function(node) { },
    BlockStatement: function(node) {
        for(var i=0, l=node.body.length; i < l; i++) {
            walk(node.body[i]);
        }
    },
    ExpressionStatement: function(node) {
        walk(node.expression);
    },
    IfStatement: function(node) {
        walk(node.text);
        walk(node.consequent);
        if(node.alternate) walk(node.alternate);
    },
    LabeledStatement: function(node) {
        walk(node.label);
        walk(node.body);
    },
    BreakStatement: function(node) {
        walk(node.label);
    },
    ContinueStatement: function(node) {
        walk(node.label);
    },
    WithStatement: function(node) {
        // Affects scope
        walk(node.object);
        walk(node.body);
    },
    SwitchStatement: function(node) {
        // QUESTION: what to do with lexical flag?
        walk(node.discriminant);
        for(var i=0, l=node.cases.length; i < l; i++) {
            walk(node.cases[i]);
        }
    },
    ReturnStatement: function(node) {
        walk(node.argument);
    },
    ThrowStatement: function(node) {
        walk(node.argument);
    },
    TryStatement: function(node) {
        // QUESTION: do what with handlers and finalizer?
        walk(node.block);
        for(var i=0, l=node.handlers.length; i<l; i++) {
            walk(node.handlers[i]);
        }
        walk(node.finalizer);
    },
    WhileStatement: function(node) {
        walk(node.test);
    },
    DoWhileStatement: function(node) {
        walk(node.body);
        walk(node.test);
    },
    ForStatement: function(node) {
        walk(node.init);
        walk(node.test);
        walk(node.update);
        walk(node.body);
    },
    ForInStatement: function(node) {
        // QUESTION: do what with each?
        walk(node.left);
        walk(node.right);
        walk(node.body);
    },
    DebuggerStatement: function(node) { },
    */
    // Declarations
    FunctionDeclaration: function(node, path) {
        var scope = getScope(path[path.length-1], path.slice(0));
        scope[node.id.name] = {
            value: node.body,
            declaration: node
        }
        return;
    },
    VariableDeclaration: function(node, path) {
        var scope = getScope(path[path.length-1], path.slice(0));
        _.each(node.declarations, function(declarator) {
            scope[declarator.id.name] = {
                value: declarator.init,
                declaration: declarator
            };
        });
        return;
    },
    /*
    VariableDeclarator: function(node, path) {
    },
    // Expressions
    */
    ExpressionStatement: function(node, path) {
        if (node.expression.type !== 'AssignmentExpression') {
            node.visited = true;
            walk(node.expression, undefined, undefined, path.concat(node));
        } else {
            walk(node.expression, undefined, undefined, path);
        }
    },
    /*
    ThisExpression: function(node, path) { },
    ArrayExpression: function(node, path) {
        for(var i=0, l=node.elements.length; i<l; i++) {
            walk(node.elements[i]);
        }
    },
    */
    ObjectExpression: function(node, path) {
        var scope = node.scope;
        _.each(node.properties, function(property) {
            scope[property.key.name || property.key.value] = {
                value: property.value,
                declaration: property
            };
        });
    },
    /*
    FunctionExpression: function(node, path) {
    },
    SequenceExpression: function(node, path) {
        for(var i=0, l=node.expressions.length; i < l; i++) {
            walk(node.expressions[i]);
        }
    },
    UnaryExpression: function(node, path) {
        // TODO: do something with operator
        walk(node.expression);
    },
    // CONTINUE HERE
    BinaryExpression: function(node, path) {
        // TODO: do something with operator
        walk(node.left);
        walk(node.right);
    },
    */
    AssignmentExpression: function(node, path) {
        if (node.operator === '=') {
            var scope, obj, declaration, leftKey;
            if (node.left.property) {
                leftKey = node.left.property.name ||
                          node.left.property.value;
            } else {
                leftKey = node.left.name ||
                          node.left.value;
            }
            if (node.left.type === 'MemberExpression') {
                obj = getReference(path[path.length-1],
                        node.left.object.name, path.slice(0)).value;
                scope = obj ? obj.scope : undefined;
                if (obj) {
                    declaration = _.find(obj.properties, function(property) {
                        var propKey;
                        propKey = property.key.name || property.key.value;
                        leftKey === propKey;
                    });
                }
            } else {
                scope = getScopeWithReference(path[path.length-1],
                        node.left,
                        path.slice(0)) ||
                        getScope(path[path.length-1], path.slice(0));
                declaration = getReference(path[path.length-1], leftKey, path.slice(0));
            }
            scope[leftKey] = {
                    value: node.right,
                    assignment: node.left,
                    declaration: declaration
                };
        }
    },
    /*
    UpdateExpression: function(node, path) {
        // QUESTION: do what with prefix boolean?
        // TODO: do something with operator
        walk(node.argument);
    },
    LogicalExpression: function(node, path) {
        // TODO: do something with operator
        walk(node.left);
        walk(node.right);
    },
    ConditionalExpression: function(node, path) {
        walk(node.test);
        walk(node.alternate);
        walk(node.consequent);
    },
    NewExpression: function(node, path) {
        walk(node.callee);
        for(var i=0, l=node.arguments.length; i<l; i++) {
            walk(node.arguments[i]);
        }
    },
    CallExpression: function(node, path) {
    },
    */
    MemberExpression: function(node, path) {
        var objectRef = getReference(path[path.length-1],
                node.object.name, path.slice(0)),
            propKey = node.property.name || node.property.value,
            propertyRef;
        if (objectRef) {
            // populate scope for object if the scope is empty.
            if (!objectRef.value.scope[propKey]) walk(objectRef.value, undefined, undefined, path.slice(0));
            propertyRef = objectRef.value.scope[propKey];
            visit(objectRef.value);
            visit(objectRef.declaration);
            if (objectRef.assignment) visit(objectRef.assignment);
            if (propertyRef) {
                visit(propertyRef.value);
                visit(propertyRef.declaration);
                if (propertyRef.assignment) visit(propertyRef.assignment);
                walk(propertyRef, undefined, undefined, path.slice(0));
            }
        } else {
            // TODO: throw error instead of console log.
            //console.log('reference not found: ' + node.name);
            return; // Only gets here if a reference wasn't found.
        }
    },

    // Patterns
    // QUESTION: what should go in patterns???

    // Clauses
    /*
    SwitchCase: function(node, path) {
        walk(node.test);
        for(var i=0, l=node.consequent.length; i<l; i++) {
            walk(node.consequent[i]);
        }
    },
    CatchClause: function(node, path) {
        walk(node.param);
        walk(node.body);
    },

    // Miscelaneous
    Property: function(node, path) {
        // QUESTION: do what with kind?
        walk(node.key);
        walk(node.value);
    },
    */
    Identifier: function(node, path) {
        var reference = getReference(path[path.length-1],
                node.name, path.slice(0));
        if (reference) {
            visit(reference.value);
            visit(reference.declaration);
            if (reference.assignment) visit(reference.assignment);
            walk(reference.value, undefined, undefined, path.slice(0));
        } else {
            // TODO: handle errors better.
            //console.log('reference not found: ' + node.name);
            return; // Only gets here if a reference wasn't found.
        }
    }
    /*
    Literal: function(node, path) {
        // TODO: assign value to something.
        // access with: node.value
    },
    UnaryOperator: function(node, path) {
        walk(node.token);
    },
    BinaryOperator: function(node, path) {
        walk(node.token);
    },
    LogicalOperator: function(node, path) {
        walk(node.token);
    },
    AssignmentOperator: function(node, path) {
        walk(node.token);
    },
    UpdateOperator: function(node, path) {
        walk(node.token);
    }
    */
};

// Turn the ast into a directed graph.
// path: array representing previously visited nodes.
var graphify = function(node, path) {
    if (node.visited) return;

    // Visit nodes based on type.
    if (visitor[node.type]) {
        visitor[node.type](node, path);
    } else {
        node.visited = true;

        for(var key in node) {
            if (key === 'parent') continue;

            var child = node[key];
            if (child instanceof Array) {
                for (var i=0, l=child.length; i<l; i++) {
                    if (child[i] && typeof child[i] === 'object' &&
                            child[i].type) {
                        graphify(child[i], undefined, undefined, path.concat(node));
                    }
                }
            } else if (child && typeof child === 'object' && child.type) {
                graphify(child, path.concat(node));
            }
        }
    }
};

var eliminate = exports.eliminate = function(fileContents) {

    // TODO: write each method if that's all I use from underscore.

    var file = fileContents || '';

    // build the ast with esprima.
    tree = parse(file, {range: true});

    result = {
        chunks : file.split(''),
        toString : function () { return result.chunks.join('') },
        inspect : function () { return result.toString() }
    };

   // Pass to initialize helpers and scopes.
    walk(tree);

    // Pass to mark nodes as visited.
    walk(tree, undefined, function(node, path) {
        if (visitor[node.type]) {
            visitor[node.type](node, path);
            return false;
        } else {
            node.visited = true;
        }
        return true;
    });
    /**
     * Pass to delete unused functions.
     * unvisited functions are assumed to be unused.
     */
    walk(tree, undefined, function(node) {
        if (!node.type || node.visited) return;

        // check for types that should be deleted.
        switch(node.type) {
            case 'FunctionExpression':
            case 'FunctionDeclaration':
            case 'ObjectExpression':
            case 'AssignmentExpression':
            case 'VariableDeclaration':
            case 'VariableDeclarator':
            case 'Property':
                removeDeclaration(node);
                break;
        }
        return true;
    });

    console.log(stringify(tree, '   ', ''));
    console.log('');
    //console.log(result.toString().trim()); // output result source.
    //console.log(result.chunks);
    return result.toString().trim();
};
})(typeof exports === 'undefined' ? (eliminator = {}) : exports);
