# Passport numbers: how a number gets marked as taken

The product page and the homepage read one list saved on the product:
**`tekila.taken_numbers`** (Products → Tekila Anxiety → Metafields → *Taken numbers*).
A number in that list shows as stamped/taken, and "X of 100 left" = 100 − the list's size.

Nothing fills this list by itself. Shopify Flow (free app by Shopify) does it.

## When a number counts as taken

**When the order is placed, not when it is paid.** Orders paid by InstaPay stay
"Payment pending" for up to 24 hours. If the number were only reserved on payment,
two people could pick the same number in that window.
If an order is cancelled, its number is released (workflow 2).

## Workflow 1: reserve the number when an order is placed

1. Shopify admin → Apps → **Shopify Flow** (install it if it isn't there) → **Create workflow**.
2. Trigger: **Order created**.
3. Add action **For each** (loop) → list: `order.lineItems`.
4. Inside the loop, add a **Condition**: *At least one of* `lineItemsForeachitem.customAttributes`
   has `key` **equal to** `Passport Nº`.
5. Under **Then**, add action **Update product metafield**:
   - Product: `lineItemsForeachitem.product`
   - Metafield: `tekila.taken_numbers` (type *List of integers*)
   - Value: paste this (it adds this order's number to the list):

```liquid
{%- assign num = "" -%}{%- for a in lineItemsForeachitem.customAttributes -%}{%- if a.key == "Passport Nº" -%}{%- assign num = a.value | strip -%}{%- endif -%}{%- endfor -%}{%- assign cur = "" -%}{%- for mf in lineItemsForeachitem.product.metafields -%}{%- if mf.namespace == "tekila" and mf.key == "taken_numbers" -%}{%- assign cur = mf.value | remove: "[" | remove: "]" | strip -%}{%- endif -%}{%- endfor -%}[{%- if cur != blank -%}{{ cur }},{%- endif -%}{{ num }}]
```

6. (Optional) Also under **Then**: action **Add order tags** → `passport-{{ num }}`. Flow keeps each
   action's Liquid separate, so repeat the first loop of the snippet to get `num`.
7. Name it "Reserve passport number" and **Turn on workflow**.

## Workflow 2: release the number when an order is cancelled

Same as workflow 1, but with trigger **Order cancelled**, and this value (the list without this order's number):

```liquid
{%- assign num = "" -%}{%- for a in lineItemsForeachitem.customAttributes -%}{%- if a.key == "Passport Nº" -%}{%- assign num = a.value | strip -%}{%- endif -%}{%- endfor -%}{%- assign out = "" -%}{%- for mf in lineItemsForeachitem.product.metafields -%}{%- if mf.namespace == "tekila" and mf.key == "taken_numbers" -%}{%- assign list = mf.value | remove: "[" | remove: "]" | split: "," -%}{%- for x in list -%}{%- assign x = x | strip -%}{%- if x != num and x != blank -%}{%- if out != blank -%}{%- assign out = out | append: "," -%}{%- endif -%}{%- assign out = out | append: x -%}{%- endif -%}{%- endfor -%}{%- endif -%}{%- endfor -%}[{{ out }}]
```

## Test it
Place a test Passport order (any free number), then open Products → Tekila Anxiety → Metafields:
the number should appear in *Taken numbers* within a minute, and on the product page it shows stamped.
Cancel the test order: the number disappears again.

## Fixing it by hand
You can always edit the list directly: Products → Tekila Anxiety → Metafields → Taken numbers.
