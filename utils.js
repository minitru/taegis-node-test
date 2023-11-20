const { isUnionType, getArgs, isDataclass, isWrappingType, isScalarType, isObjectType } = require('graphql');
const { getLogger } = require('winston');
const { run } = require('async');
const { submit } = require('concurrently');
const { isEnum } = require('enum34');
const { isOptional, isDict, isAny } = require('typing');
const { fields: dcFields } = require('dataclass');

const log = getLogger(__name__);

function buildOutputString(cls) {
    if (isUnionType(cls)) {
        const fragments = ["__typename"];
        for (const item of getArgs(cls)) {
            const outputString = _buildDataclassString(item);
            fragments.push(`... on ${item.__name__} {${outputString}}`);
        }
        return fragments.join("\n");
    }

    return _buildDataclassString(cls);
}

function _buildDataclassString(cls) {
    const outputFields = [];
    for (const field of dcFields(cls)) {
        const letterCase = field.metadata.get("dataclasses_json", {}).get("letter_case");
        let fieldName;
        if (letterCase) {
            fieldName = letterCase(...);
        } else {
            fieldName = field.name;
        }

        if (field.metadata.get("deprecated")) {
            log.warning(
                `Output field \`${fieldName}\` is deprecated: ` +
                `'${field.metadata.get('deprecation_reason')}', ` +
                "removing from default output..."
            );
            continue;
        }

        outputFields.push(fieldName);

        let type_ = field.type;
        while (args := getArgs(type_)) {
            type_ = args[0];
        }

        if (isDataclass(type_)) {
            outputFields.push(`{ ${_buildDataclassString(type_)} }`);
        }
    }

    return outputFields.join(" ");
}

function graphqlUnwrapField(field) {
    let fieldType;
    if (field.hasOwnProperty('type')) {
        fieldType = field.type;
    } else if (field.hasOwnProperty('of_type')) {
        fieldType = field.of_type;
    } else {
        return field;
    }

    if (isWrappingType(fieldType)) {
        return graphqlUnwrapField(fieldType.of_type);
    }
    return fieldType;
}

function buildOutputStringFromIntrospection(field) {
    const fields = [];
    field = graphqlUnwrapField(field);

    if (isScalarType(field)) {
        return "";
    }

    if (isUnionType(field)) {
        const fragments = ["__typename"];
        for (const gqlType of field.types) {
            fragments.push(
                `... on ${gqlType.name} { ${buildOutputStringFromIntrospection(gqlType)} }`
            );
        }
        return fragments.join("\n");
    }

    for (const [name, gqlType] of Object.entries(field.fields)) {
        fields.push(name);
        const scalar = graphqlUnwrapField(gqlType);
        if (isObjectType(scalar)) {
            fields.push(`{ ${buildOutputStringFromIntrospection(scalar)} }`);
        }
    }
    return fields.join(" ");
}

function asyncBlock(coro) {
    return function(...args) {
        function runAsync(coro, ...args) {
            return run(coro(...args));
        }

        let result;
        submit(runAsync, coro, ...args).then((future) => {
            result = future.result();
        });

        return result;
    };
}

function prepareInput(value) {
    if (isDataclass(value)) {
        for (const field of dcFields(value)) {
            const letterCase = field.metadata.get("dataclasses_json", {}).get("letter_case");
            let fieldName;
            if (letterCase) {
                fieldName = letterCase(...);
            } else {
                fieldName = field.name;
            }

            if (field.metadata.get("deprecated")) {
                log.warning(
                    `Input field \`${fieldName}\` is deprecated: ` +
                    `'${field.metadata.get('deprecation_reason')}'`
                );
            }
        }

        return value.to_dict({ encode_json: true }).filter((_, value) => value !== null);
    }

    if (isEnum(value)) {
        return value.value;
    }

    if (Array.isArray(value)) {
        return value.map(prepareInput);
    }

    return value;
}

function prepareVariables(variables) {
    if (variables) {
        return variables.filter((_, value) => value !== null);
    }
    return null;
}

function parseUnionResult(union, result) {
    for (const item of getArgs(union)) {
        if (result.get("__typename") === item.__name__) {
            return item.from_dict(result);
        }
    }
    return result;
}

function removeNode(query, node, location) {
    const key = node.name.value;
    const startIdx = location.column - 1;
    let endIdx;

    let bracketsFound = 0;
    for (let idx = 0; idx < query.length; idx++) {
        const char = query[idx];
        if (idx < startIdx + key.length) {
            continue;
        }

        if (char === " ") {
            continue;
        }

        if (bracketsFound === 0 && char !== "{") {
            endIdx = idx;
            break;
        }

        if (char === "{") {
            bracketsFound++;
        } else if (char === "}") {
            bracketsFound--;
        }

        endIdx = idx;
    }

    return query.slice(0, startIdx) + query.slice(endIdx);
}

module.exports = {
    buildOutputString,
    asyncBlock,
    prepareInput,
    prepareVariables,
    parseUnionResult,
    buildOutputStringFromIntrospection,
    removeNode,
};