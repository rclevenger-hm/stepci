# Matchers

Matchers can be used to match values against a pre-defined set of rules

::: info
The syntax is inspired by MongoDB's [Comparison Query Operators](https://www.mongodb.com/docs/manual/reference/operator/query-comparison/)
:::

**Example: Time to first byte to be lower or equal 500ms**

```yaml{9}
steps:
  - name: GET Request
    http:
      url: https://example.com
      method: GET
      check:
        performance:
          firstByte:
            - lte: 500
```

**Example: Chaining matchers**

```yaml{9-10}
steps:
  - name: GET Request
    http:
      url: https://example.com
      method: GET
      check:
        performance:
          firstByte:
            - lte: 500
            - gte: 100
```

### Available Matchers

**Comparison operators**

- `eq` - Deep equality
- `ne` - Not equal (!==)
- `gt` - Greater than (>)
- `gte` - Greater than or equal (>=)
- `lt` - Lower than (<)
- `lte` - Lower than or equal (<=)
- `in` - Includes
- `nin` - Not includes
- `match` - Regex pattern

**Boolean operators**

- `isNumber` - Is Number
- `isString` - Is String
- `isBoolean` - Is Boolean
- `isNull` - Is Null
- `isDefined` - Is Defined
- `isObject` - Is Object
- `isArray` - Is Array

### Missing values and negative checks

Missing/null values fail `in` and `match`, and pass `nin`. An empty array fails
`in` and passes `nin`. Unsupported membership value types follow the same rules.
`nin` does not require a field to exist: combine it with `isDefined: true` and an
appropriate type check when those are requirements. Invalid expressions fail
their own check while preserving unrelated results. See the
[tested matcher contract](../maintainers/dev.md#correct-failure-behavior).
