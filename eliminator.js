(function(exports) {
var _ = require('underscore'),
    parse = require('esprima').parse,
    result,
    tree;

// action that the walker uses on the visit pass.
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

// check if the given character can be cleaned from the source
var isCleanable = function(character) {
    switch(character) {
        case ' ':
        case ',':
        case '=':
            return true;
    }
    return false;
};

// determines the non-space character to the right or left of the start point
var boundChar = function(chunks, start, inc) {
    var c = chunks[start];

    while(c === ' ' || c === '') {
       c = chunks[start+=inc];
    }

    return c;
};

// removes extraneous characters around removed declarators or
// declarator initializers
var cleanupAround = function(range) {
    var start = range[0]-1,
        end = range[1]+1,
        lastIndex = result.chunks.length-1,
        leftBound = boundChar(result.chunks, start, -1),
        rightBound = boundChar(result.chunks, end, 1);

    if (leftBound === '=' || leftBound === ',' && rightBound !== ',') {
        // delete left over comma
        for(;start > 0 && isCleanable(result.chunks[start]); start--) {
            result.chunks[start] = '';
        }
    } else {
        if (leftBound === '\n') {
            // delete left to beginning of line
            for(;start > 0 && isCleanable(result.chunks[start]); start--) {
                result.chunks[start] = '';
            }
        }
        // delete right over comma
        for(;end < lastIndex && isCleanable(result.chunks[end]); end++) {
            result.chunks[end] = '';
        }
    }
};

// walk up the tree until the closest declaration is found then remove it.
var removeNode = function(node) {
    if (node.visited) return;

    if (node.parent.visited) {
        cleanupAround(node.range);
        node.destroy();
    } else {
        removeNode(node.parent);
    }
};

// find the nearest object or global object.
var getThis = function(node) {
    if (!node || node.type === 'Program') {
        return { value: tree };
    } else {
        return node.type === 'ObjectExpression' ? { value: node } : getThis(node.parent);
    }
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
        var obj = getReference(node, ref.object);
        return obj ? obj.value.scope : undefined;
    }

    if (node.scope && node.scope[ref.name || ref.value]) {
        return node.scope;
    } else {
         return getScopeWithReference(node.parent, ref);
    }
};

// find the specified reference in the scoped scope hierarchy.
var getReference = function(node, ref) {
    var name;
    if (!node || !ref) return;

    if (!ref.type) {
        name = ref;
    } else if (ref.type === 'Identifier') {
        name = ref.name;
    } else if (ref.type === 'MemberExpression') {
        // TODO: refactor this since logic is similar to walking
        // a member expression.
        var objectRef,
            propKey = ref.property.name || ref.property.value,
            propertyRef;

        objectRef = getReference(node, ref.object);

        if (objectRef && objectRef.value.scope) {
            // populate scope for object if the scope is empty.
            if (!objectRef.value.scope[propKey]) {
                walk(objectRef.value, grapher);
            }
            propertyRef = objectRef.value.scope[propKey];
            return propertyRef ? 
                getReference(node, propertyRef) :
                undefined;
        } else {
            return; // Only gets here if a reference wasn't found.
        }
    } else if (ref.type === 'ThisExpression') {
        return getThis(node);
    } else {
        return { value: ref }; // if ref isn't actually a reference to something else
    }

    return (node.scope && node.scope[name]) ?
        node.scope[name] :
        getReference(node.parent, name);
};

// marks all nodes from the given up to the root expression node as visited.
var visit = function(node) {
    if (!node || node.visited) return;
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

// object to store the unique visitor functions.
var visitor = {
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

    ExpressionStatement: function(node) {
        if (node.expression.type !== 'AssignmentExpression') {
            visit(node);
            walk(node.expression, grapher);
        } else {
            walk(node.expression, grapher);
        }
    },

    ObjectExpression: function(node) {
        var scope = node.scope;
        _.each(node.properties, function(property) {
            scope[property.key.name || property.key.value] = {
                value: property.value,
                declaration: property
            };
        });
    },

    AssignmentExpression: function(node) {
        if (node.operator === '=') {
            var scope, obj, declaration, leftKey, objRef;
            if (node.left.property) {
                leftKey = node.left.property.name ||
                          node.left.property.value;
            } else {
                leftKey = node.left.name ||
                          node.left.value;
            }
            if (node.left.type === 'MemberExpression') {
                objRef = getReference(node, node.left.object);
                obj = objRef ? objRef.value : undefined;
                scope = obj ? obj.scope : undefined;
                if (obj) {
                    declaration = _.find(obj.properties, function(property) {
                        var propKey;
                        propKey = property.key.name || property.key.value;
                        leftKey === propKey;
                    });
                }
            } else {
                scope = getScopeWithReference(node, node.left) || 
                    getScope(tree);
                declaration = scope[leftKey] ? 
                    getReference(node, leftKey).declaration :
                    undefined;
            }
            if (scope) {
                scope[leftKey] = {
                    value: node.right,
                    assignment: node.left,
                    declaration: declaration
                };
            }
        }
    },

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
        var objectRef,
            propKey = node.property.name || node.property.value,
            propertyRef;

        objectRef = node.object.type === 'ThisExpression' ? 
            getThis(node) :
            getReference(node, node.object.name);

        if (objectRef && objectRef.value.scope) {
            // populate scope for object if the scope is empty.
            if (!objectRef.value.scope[propKey]) {
                walk(objectRef.value, grapher);
            }
            propertyRef = objectRef.value.scope[propKey];
            visit(objectRef.value);
            if (objectRef.declaration) visit(objectRef.declaration);
            if (objectRef.assignment) visit(objectRef.assignment);
            if (propertyRef) {
                if (propertyRef.declaration) visit(propertyRef.declaration);
                if (propertyRef.assignment) visit(propertyRef.assignment);
                walk(propertyRef.value, grapher);
            }
        } else {
            return; // Only gets here if a reference wasn't found.
        }
    },

    ThisExpression: function(node) {
        var reference = getThis(node);

        if (reference) {
            walk(reference.value, grapher);
            if (reference.declaration) visit(reference.declaration);
            if (reference.assignment) visit(reference.assignment);
        } else {
            // TODO: handle errors better.
            return; // Only gets here if a reference wasn't found.
        }
    },

    Identifier: function(node) {
        var reference = getReference(node,
                node.name);
        if (reference && reference.value) {
            walk(reference.value, grapher);
            if (reference.declaration) visit(reference.declaration);
            if (reference.assignment) visit(reference.assignment);
        } else {
            // TODO: handle errors better.
            return; // Only gets here if a reference wasn't found.
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
                removeNode(node);
                break;
        }
        return true;
    });

    //console.log(stringify(tree, '   ', ''));
    //console.log(result.toString().trim()); // output result source.
    return result.toString().trim();
};
})(typeof exports === 'undefined' ? (eliminator = {}) : exports);
