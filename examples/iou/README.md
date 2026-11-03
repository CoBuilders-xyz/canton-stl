# IOU example

The original Network Helpers prototype moved into an example directory. The
model's issuer creates an IOU observed by its owner. The owner can transfer it;
the issuer can settle it by archiving it. Settlement does not transfer money.

```sh
# From the repository root:
npm run test:iou
npm run example:iou
npm run benchmark:iou
```

The suite includes four Daml Script tests, ten Mocha/Chai tests, and one Node
integration test. Fixtures create new parties, users, and contracts for every
case. The Sandbox process can be shared; fixtures are rebuilt, not restored.
The Node test also checks endpoint shutdown after an intentional callback error.

The benchmark compares new Sandbox processes with one shared process performing
the same work. It is not a comparison against another toolkit. Results go into
the ignored `.reports/` directory. No historical benchmark numbers are claimed
as results of this repository's CI.
