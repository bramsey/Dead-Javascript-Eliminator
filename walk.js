(function(exports) {
var _ = require('underscore'),
    parse = require('esprima').parse,
    result,
    tree;

var grapher = function(node) {
    if (node.visited) return false;
    if (visitor[node.type]) {
        visitor[node.type](node);
    } else {
        visit(node);
        return true;
    }
    return false;
};

var stringify = function(node, tab, indent) {
    var output = '';
    for (var key in node) {
        if (key === 'source' || key === 'destroy') continue;


        var child = node[key];
        if (key === 'scope') {
            if (child.printed) {
                return output;
            } else {
                child.printed = true;
            }
        }
        if (key === 'parent') {
            output += indent + key + ': ' + 
                (child ? child.type : undefined) + '\n';
            continue;
        } else if (child instanceof Array) {
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
        } else {
            return output;
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
var walk = function(node, action, parent) {
    var shouldWalk;
    insertHelpers(node, parent);

    shouldWalk = action ? action(node) : true;
    if (!shouldWalk) return;

    for (var key in node) {
        if (key === 'parent') continue;

        var child = node[key];
        if (child instanceof Array) {
            for (var i=0, l=child.length; i<l; i++) {
                if (child[i] && typeof child[i] === 'object' &&
                        child[i].type) {
                    walk(child[i], action, node);
                }
            }
        } else if (child && typeof child === 'object' && child.type) {
            walk(child, action, node);
        }
    }
};

var isCleanable = function(character) {
    switch(character) {
        case ' ':
        case ',':
        case '=':
            return true;
    }
    return false;
};

var boundChar = function(chunks, start, inc) {
    var c = chunks[start];

    while(c === ' ' || c === '') {
       c = chunks[start+=inc];
    }

    return c;
};

var cleanupDeclarator = function(range) {
    var start = range[0]-1,
        end = range[1]+1,
        lastIndex = result.chunks.length-1,
        leftBound = boundChar(result.chunks, start, -1),
        rightBound = boundChar(result.chunks, end, 1);

    if (leftBound === ',' && rightBound !== ',') {
        // delete left over comma
        for(;start > 0 && isCleanable(result.chunks[start]); start--) {
            result.chunks[start] = '';
        }
    } else {
        // delete right over comma
        for(;end < lastIndex && isCleanable(result.chunks[end]); end++) {
            result.chunks[end] = '';
        }
    }
};

var cleanupInitializer = function(range) {
    var start = range[0]-1,
        end = range[1]+1,
        lastIndex = result.chunks.length-1,
        leftBound = boundChar(result.chunks, start, -1);

    if (leftBound === '=') {
        // delete left
        for(;start > 0 && 
                (result.chunks[start] === ' ' || result.chunks[start] === '=');
                start--) {
            result.chunks[start] = '';
        }
    }
    // delete right
    for(;end < lastIndex && result.chunks[end] === ' '; end++) {
        result.chunks[end] = '';
    }
};


// walk up the tree until the closest declaration is found then remove it.
// TODO: refactor to use a deletor similar to visitor pattern.
var removeDeclaration = function(node) {
    if (node.visited) return;
    if (node.type === 'VariableDeclarator') {
        if (node.parent.declarations.length === 1) {
            console.log('deleted: ' + node.id.name);
            node.parent.destroy(); // remove parent if only declarator.
        } else {
            if (node.parent.visited) {
                console.log('deleting with source: ');
                cleanupDeclarator(node.range);
                node.destroy();
            } else {
                removeDeclaration(node.parent);
            }
        }
    } else if (node.parent.type === 'VariableDeclarator') {
        if (node.parent.visited) {
            cleanupInitializer(node.range);
            node.destroy();
        }
    } else if (node.type === 'AssignmentExpression') {
        console.log('deleted: ' + node.left.name);
        node.parent.destroy();
    } else {
        console.log('deleted: ' + node.type);
        node.destroy();
        if (node.parent) removeDeclaration(node.parent);
    }
    return;
};

// find the nearest scope by walking up the tree.
var getScope = function(node) {
    if (!node) return;
    return node.scope ? node.scope : getScope(node.parent);
};

// find the nearest scope with the specified reference.
var getScopeWithReference = function(node, ref) {
    if (!node) return;

    if (ref.type === 'MemberExpression') {
        var obj = getReference(node, ref.object.name);
        obj.visited = true;// TODO: this belongs someplace else probably
        return obj ? obj.scope : undefined;
    }

    if (node.scope && node.scope[ref.name || ref.value]) {
        node.visited = true;
        return node.scope;
    } else {
        getScopeWithReference(node.parent, ref);
    }
};

// find the specified reference in the scoped scope hierarchy.
var getReference = function(node, ref) {
    var name;
    if (!node) return;

    if (!ref.type) {
        name = ref;
    } else if (ref.type === 'Identifier') {
        name = ref.name;
    } else if (ref.type === 'MemberExpression') {
        // TODO: refactor this since logic is similar to walking
        // a member expression.
        var objectRef = getReference(node, ref.object.name),
            propKey = ref.property.name || ref.property.value,
            propertyRef;
        if (objectRef) {
            // populate scope for object if the scope is empty.
            if (!objectRef.value.scope[propKey]) {
                walk(objectRef.value, grapher);
            }
            propertyRef = objectRef.value.scope[propKey];
            return propertyRef ? 
                getReference(node, propertyRef) :
                undefined;
        } else {
            // TODO: throw error instead of console log.
            //console.log('reference not found: ' + node.name);
            return; // Only gets here if a reference wasn't found.
        }
    } else {
        return ref; // if ref isn't actually a reference to something else
    }

    return (node.scope && node.scope[name]) ?
        node.scope[name] :
        getReference(node.parent, name);
};

var visit = function(node) {
    if (!node || node.visited) return;
    //console.log('visiting: ' + node.type + ' -> ' + node.name + '\n');
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
    FunctionDeclaration: function(node) {
        var scope = getScope(node.parent);
        scope[node.id.name] = {
            value: node.body,
            declaration: node
        }
        return;
    },
    VariableDeclaration: function(node) {
        var scope = getScope(node);
        _.each(node.declarations, function(declarator) {
            scope[declarator.id.name] = {
                value: declarator.init,
                declaration: declarator
            };
        });
        return;
    },
    /*
    VariableDeclarator: function(node) {
    },
    // Expressions
    */
    ExpressionStatement: function(node) {
        if (node.expression.type !== 'AssignmentExpression') {
            visit(node);
            walk(node.expression, grapher);
        } else {
            walk(node.expression, grapher);
        }
    },
    /*
    ThisExpression: function(node) { },
    ArrayExpression: function(node) {
        for(var i=0, l=node.elements.length; i<l; i++) {
            walk(node.elements[i]);
        }
    },
    */
    ObjectExpression: function(node) {
        var scope = node.scope;
        _.each(node.properties, function(property) {
            scope[property.key.name || property.key.value] = {
                value: property.value,
                declaration: property
            };
        });
    },
    /*
    FunctionExpression: function(node) {
    },
    SequenceExpression: function(node) {
        for(var i=0, l=node.expressions.length; i < l; i++) {
            walk(node.expressions[i]);
        }
    },
    UnaryExpression: function(node) {
        // TODO: do something with operator
        walk(node.expression);
    },
    // CONTINUE HERE
    BinaryExpression: function(node) {
        // TODO: do something with operator
        walk(node.left);
        walk(node.right);
    },
    */
    AssignmentExpression: function(node) {
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
                obj = getReference(node,
                        node.left.object.name).value;
                scope = obj ? obj.scope : undefined;
                if (obj) {
                    declaration = _.find(obj.properties, function(property) {
                        var propKey;
                        propKey = property.key.name || property.key.value;
                        leftKey === propKey;
                    });
                }
            } else {
                scope = getScopeWithReference(node,
                        node.left) ||
                        getScope(node);
                declaration = getReference(node, leftKey).declaration;
            }
            scope[leftKey] = {
                    value: node.right,
                    assignment: node.left,
                    declaration: declaration
                };
        }
    },
    /*
    UpdateExpression: function(node) {
        // QUESTION: do what with prefix boolean?
        // TODO: do something with operator
        walk(node.argument);
    },
    LogicalExpression: function(node) {
        // TODO: do something with operator
        walk(node.left);
        walk(node.right);
    },
    ConditionalExpression: function(node) {
        walk(node.test);
        walk(node.alternate);
        walk(node.consequent);
    },
    NewExpression: function(node) {
        walk(node.callee);
        for(var i=0, l=node.arguments.length; i<l; i++) {
            walk(node.arguments[i]);
        }
    },
    */
    CallExpression: function(node) {
        var callee = getReference(node, node.callee),
            params;

        if (callee && callee.value) {
            callee = callee.value.params ? 
                callee.value : 
                callee.value.parent;
            params = callee.params;
        }
        if (params) {
            for (var i=0, l=params.length; i < l; i++) {
                callee.scope[params[i].name] = node['arguments'][i] ?
                    {
                        value: node['arguments'][i]
                    } : undefined;
            }
        }
        
        visit(node);
        walk(node.callee, grapher);
        _.each(node.arguments, function(argument) {
            walk(argument, grapher);
        });
    },
    MemberExpression: function(node) {
        var objectRef = getReference(node,
                node.object.name),
            propKey = node.property.name || node.property.value,
            propertyRef;
        if (objectRef) {
            // populate scope for object if the scope is empty.
            if (!objectRef.value.scope[propKey]) {
                walk(objectRef.value, grapher);
            }
            propertyRef = objectRef.value.scope[propKey];
            visit(objectRef.value);
            if (objectRef.declaration) visit(objectRef.declaration);
            if (objectRef.assignment) visit(objectRef.assignment);
            if (propertyRef) {
                visit(propertyRef.value);
                if (propertyRef.declaration) visit(propertyRef.declaration);
                if (propertyRef.assignment) visit(propertyRef.assignment);
                walk(propertyRef, grapher);
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
    SwitchCase: function(node) {
        walk(node.test);
        for(var i=0, l=node.consequent.length; i<l; i++) {
            walk(node.consequent[i]);
        }
    },
    CatchClause: function(node) {
        walk(node.param);
        walk(node.body);
    },

    // Miscelaneous
    Property: function(node) {
        // QUESTION: do what with kind?
        walk(node.key);
        walk(node.value);
    },
    */
    Identifier: function(node) {
        var reference = getReference(node,
                node.name);
        if (reference) {
            walk(reference.value, grapher);
            visit(reference.value);
            visit(reference.declaration);
            if (reference.assignment) visit(reference.assignment);
        } else {
            // TODO: handle errors better.
            //console.log('reference not found: ' + node.name);
            return; // Only gets here if a reference wasn't found.
        }
    }
    /*
    Literal: function(node) {
        // TODO: assign value to something.
        // access with: node.value
    },
    UnaryOperator: function(node) {
        walk(node.token);
    },
    BinaryOperator: function(node) {
        walk(node.token);
    },
    LogicalOperator: function(node) {
        walk(node.token);
    },
    AssignmentOperator: function(node) {
        walk(node.token);
    },
    UpdateOperator: function(node) {
        walk(node.token);
    }
    */
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
    walk(tree, grapher);

    /**
     * Pass to delete unused functions.
     * unvisited functions are assumed to be unused.
     */
    walk(tree, function(node) {
        if (!node.type || node.visited) return true;

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

    //console.log(stringify(tree, '   ', ''));
    console.log('');
    //console.log(result.toString().trim()); // output result source.
    //console.log(result.chunks);
    return result.toString().trim();
};
})(typeof exports === 'undefined' ? (eliminator = {}) : exports);
