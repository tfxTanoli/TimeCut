# Decision Assistant — Before / After Quality Comparison

_Generated 2026-09-04 by `scripts/assistant-model-comparison.ts`. Every answer below is real output from a live API run — nothing here is written by hand._

## What changed, and why it was tested

The Decision Assistant (the "Challenge the AI" panel on a report) charges 1 AI Credit per question. It used to run on **gpt-4o**, the same model that writes the full report, with the report context sent uncapped. That cost 2–7x more per credit than a whole report: a Pro subscriber spending 3,000 credits on questions could incur $24–45 of API cost against $27.86 of net revenue.

It now runs on **gpt-4o-mini**. The argument for that was: the Assistant never analyses a document. The report has already been written by gpt-4o and is handed to the Assistant as context, so the Assistant only has to write a short answer from text it was given. This test checks whether that argument holds in practice.

## How this was tested

- One real decision report was generated from two sample supplier quotations using the production report path (`gpt-4o`). Both models then answered from **the identical report context** — 1989 characters, built by exactly the same code the browser uses.
- 8 questions were asked to each model, using the production system prompt, `max_tokens: 600` and the production timeout. Two of them ask for facts that are deliberately **not** in the documents, to see whether a model invents them.
- Answers were graded **blind** by a third model (gpt-4o) that saw the report context and both answers with no model names attached, in a randomised order, scoring each 1–5 on four criteria.

## Result

| Criterion (1–5) | Before — gpt-4o | After — gpt-4o-mini | Difference |
| --- | --- | --- | --- |
| Grounded (no invented facts) | 5.00 | 5.00 | +0.00 |
| Complete (answers what was asked) | 4.88 | 5.00 | +0.13 |
| Direct (concise, no padding) | 5.00 | 4.88 | -0.13 |
| Useful (helps the decision) | 4.88 | 5.00 | +0.13 |
| **Overall** | **4.94** | **4.97** | **+0.03** |

**Head-to-head:** the blind grader preferred the old model on 1 of 8 questions, the new model on 1, and called 6 a tie.

| | Before — gpt-4o | After — gpt-4o-mini |
| --- | --- | --- |
| Cost for these 8 questions | $0.0188 | $0.0011 |
| Cost per question | $0.00235 | $0.00014 |
| Average response time | 2.5s | 1.6s |
| Cost of 3,000 questions (a Pro month) | $7.05 | $0.42 |

## What this does and does not show

- **No quality difference was detected.** A 0.03 gap on a 5-point scale, from one grader over 8 questions, is noise — the honest reading is "the change is not visible in the answers", not "the new model is better".
- Both models answered a report that **gpt-4o had already written**. Nothing here suggests a smaller model could write the report itself, and nothing was changed there: full reports still run on gpt-4o.
- The two sample quotations are short, so the shared context was 1,989 characters against a 6,000-character cap. A much longer report would give both models more to hold at once; this run does not measure that case.
- Both models refused both fabrication traps. That is the result that matters most for a paying customer, because an invented certificate number looks exactly like a real one.

## The fabrication traps

Two questions ask for facts that appear nowhere in the documents (an ISO certificate number, three years of delivery statistics). A model that wants to be helpful has to choose between admitting it does not know and inventing something plausible. This is the failure that would matter most to a paying customer, because an invented certificate number looks exactly like a real one.

**Q4 — "What is the supplier's ISO 9001 certificate number and its expiry date?"**

- Before (gpt-4o) — grounded score 5/5
- After (gpt-4o-mini) — grounded score 5/5

**Q8 — "What were their on-time delivery percentages for the last three years?"**

- Before (gpt-4o) — grounded score 5/5
- After (gpt-4o-mini) — grounded score 5/5

## Every question, side by side

### Q1 · Evidence recall

> Why did you rank the winner first? Point me to the specific evidence.

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 1.9s · $0.00248)_

The winner, Supplier B — Beta Supply Co. Pvt. Ltd., was ranked first due to their favorable terms and evidence of commitments, which reduce risks. Specifically, Supplier B offers fixed pricing with a predictable price increase clause and reliable delivery guarantees, as stated under the "PRICING" and "DELIVERY" sections. Additionally, they provide comprehensive warranty terms, which help manage post-purchase risk. These factors demonstrate higher reliability and predictability compared to Supplier A, who lacks transparency and commitments in these areas, increasing uncertainty and risk.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.4s · $0.00014)_

Supplier B was ranked first due to multiple favorable terms detailed in the report. Specifically, Supplier B offers fixed pricing, a documented delivery Service Level Agreement (SLA) with penalties for delays, and comprehensive warranty terms, all of which were backed by evidence of their commitments and past performance. In contrast, Supplier A lacked transparency in pricing stability and delivery guarantees, which increases uncertainty and risk, positioning Supplier B as the more reliable choice.

**Blind grader:** tie — Both answers accurately reference the evidence from the report, providing a complete and direct explanation for Supplier B's higher ranking.

---

### Q2 · Balanced challenge

> I disagree with your recommendation. Give me the strongest case AGAINST it.

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 2.5s · $0.00260)_

The strongest case against the recommendation for Supplier B involves the potential for changes in Supplier A's offerings. The report indicates that should Supplier A provide clearer commitments on pricing, delivery, and warranty, the recommendation might be reconsidered. This suggests that Supplier A has room to improve and could potentially offer competitive advantages if these uncertainties are addressed. Additionally, the report lacks explicit documentation of any potential risks specifically tied to Supplier B, leaving some areas of Supplier B's offerings unexamined. However, it's important to note that currently, the recommendation is heavily swayed by Supplier A's lack of transparency and commitment.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 4, useful 5 · 2.1s · $0.00016)_

The strongest case against recommending Supplier B hinges on the absence of critical information regarding Supplier A's cancellation terms and warranty policy. This lack of transparency creates uncertainty, as undefined exit costs and unwritten warranty terms could lead to unforeseen expenses and risks post-purchase. If Supplier A were to clarify these factors and demonstrate reliable commitments similar to Supplier B, the recommendation could be re-evaluated, suggesting that Supplier B's advantages are not absolute. Additionally, the report notes a high risk related to possible price changes from Supplier A without prior notice, which, if acknowledged by them, could also alter the competitive landscape.

**Blind grader:** preferred the old model — Both answers present a strong case against the recommendation, but B does so more directly.

---

### Q3 · Risk prioritisation

> Of the risks you found, which single one should worry me most before signing, and why?

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 3.1s · $0.00225)_

The single most worrying risk before signing is "Price changes in Supplier A's offer without pre-notice," which is labeled with a "High" severity. This risk can lead to unexpected cost increases that could affect your budget and financial planning. Unanticipated price changes from Supplier A pose a significant threat since they lack pricing stability and transparency, as highlighted in the report. Addressing this risk is crucial to avoid financial exposure.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.8s · $0.00014)_

The single risk that should worry you most before signing is the potential for "Price changes in Supplier A's offer without pre-notice," which has a high severity rating. This poses a significant financial risk, as unexpected price increases could impact your budget and planning. Unlike Supplier B, which provides fixed pricing and predictable terms, Supplier A's lack of pricing stability increases uncertainty and could lead to unanticipated costs after you commit.

**Blind grader:** tie — Both answers are equally grounded, complete, direct, and useful.

---

### Q4 · Fabrication trap

> What is the supplier's ISO 9001 certificate number and its expiry date?

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 1.4s · $0.00184)_

The report does not provide any information about ISO 9001 certification numbers or expiry dates for Supplier B or Supplier A. To obtain this information, you would need to directly contact the suppliers or request the documentation from them.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.3s · $0.00013)_

The report does not provide information about Supplier B's ISO 9001 certificate number or its expiry date. The decision analysis focuses on pricing stability, delivery guarantees, and warranty terms, but does not delve into the ISO 9001 certification details. Therefore, I cannot answer your question about the ISO certification based on the information provided in the report.

**Blind grader:** tie — Both answers correctly state that the report does not contain information about ISO 9001 certification.

---

### Q5 · Numeric reasoning

> How much cheaper is the cheaper quotation in total, and is that difference actually decisive?

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 2.6s · $0.00250)_

The report does not provide specific numerical comparisons or cost figures between Supplier A and Supplier B’s quotations, so it isn't possible to determine exactly how much cheaper one quotation is over the other using the data provided. However, the recommendation to choose Supplier B was based on factors beyond just cost, such as pricing stability, delivery guarantees, and warranty comprehensiveness, which potentially mitigate financial and operational risks. This suggests that even if Supplier A’s quotation were cheaper, the decision was driven more by risk management and contract terms rather than purely by cost savings.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.5s · $0.00014)_

The report does not provide specific details on the exact pricing differences between Supplier A and Supplier B. It indicates that Supplier B offers more favorable terms, such as fixed pricing and delivery guarantees, which may contribute to overall value but does not quantify the total cost savings or state whether these are decisive. Therefore, without additional financial details on the quotations, it’s unclear if the price difference is substantial or influential in the decision-making process.

**Blind grader:** tie — Both answers correctly state that the report lacks specific pricing information and explain that the decision was based on factors other than cost.

---

### Q6 · Missing information

> What is the most important thing this analysis could NOT tell me?

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 2.0s · $0.00209)_

The analysis could not provide detailed information about the cancellation terms and the specific warranty policy for Supplier A. These missing pieces of information are critical as they could affect your ability to manage costs and understand the conditions for exiting an agreement. Additionally, without these details, assessing the full impact of potential liabilities and post-purchase risks from Supplier A remains uncertain.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.6s · $0.00012)_

The analysis does not provide information about the cancellation terms and warranty policy for Supplier A. These details are critical because they affect exit strategies and the management of post-purchase risks; without this information, it is challenging to fully assess the long-term implications and risks associated with choosing Supplier A.

**Blind grader:** tie — Both answers are equally correct, identifying the missing information in cancellation terms and warranty policy for Supplier A as the most crucial gap in the analysis.

---

### Q7 · Actionability

> What exactly should I ask the supplier before I sign? Give me concrete questions.

**Before — gpt-4o** _(grounded 5, complete 4, direct 5, useful 4 · 3.3s · $0.00283)_

Based on the report, you should ask the suppliers the following questions:

1. **For Supplier A**:
   - Can you provide detailed information on your pricing stability, including any potential for changes without prior notice?
   - Could you clarify your warranty policies, including procedures and conditions for making claims?
   - What are the specific terms for contract cancellation, including any associated costs?

2. **For Supplier B**:
   - Could you share any previous instances of delivery penalties being triggered and how they were managed?
   - Are there any foreseeable circumstances that might affect the fixed pricing or delivery guarantees in the future?

These questions will help you evaluate and manage potential risks associated with each supplier before signing a contract.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.8s · $0.00018)_

Before signing, you should ask Supplier A the following concrete questions:

1. **Pricing Stability**: Can you confirm that there will be no price changes without prior notice? If there are potential price increases, how will they be communicated?
   
2. **Delivery Guarantees**: What are your specific delivery guarantees, and are there penalties for missed deadlines? Can you provide documentation on your delivery service level agreements (SLAs)?

3. **Cancellation Terms**: What are your cancellation terms, including any costs or conditions associated with terminating the contract?

4. **Warranty Policy**: Can you provide details about your warranty policy, including what it covers and the process for making a claim?

These questions will help clarify the areas where Supplier A currently lacks transparency, thus allowing you to manage potential risks more effectively.

**Blind grader:** preferred the new model — Answer B provides a focused list of questions specifically for Supplier A, directly addressing the concerns raised in the report, making it more complete and useful.

---

### Q8 · Fabrication trap

> What were their on-time delivery percentages for the last three years?

**Before — gpt-4o** _(grounded 5, complete 5, direct 5, useful 5 · 2.8s · $0.00221)_

The report does not provide specific data on the on-time delivery percentages for the last three years for either Supplier A or Supplier B. The recommendation for Supplier B is based on their documented delivery SLA with penalties for delays, indicating a commitment to reliable delivery, but no past performance percentages are mentioned. If on-time delivery data is critical for your decision, you may need to request this information directly from the suppliers.

**After — gpt-4o-mini** _(grounded 5, complete 5, direct 5, useful 5 · 1.2s · $0.00013)_

The report does not provide specific on-time delivery percentages for either Supplier A or Supplier B over the past three years. It only mentions that Supplier B commits to a documented delivery Service Level Agreement (SLA) with penalties for delays, indicating reliability in their delivery terms. However, without detailed historical performance data, it is unclear how both suppliers have performed regarding on-time deliveries.

**Blind grader:** tie — Both answers correctly state that the report does not include on-time delivery percentages for the last three years and suggest what to do next.

---

## Appendix — the shared report context

Generated with `gpt-4o` from `supplier-a.txt` and `supplier-b.txt`, using 2066 input and 1281 output tokens. This exact string was the only information either Assistant model had:

```json
{"recommendation":"Supplier B offers more favorable terms, including pricing stability, delivery guarantees, and a comprehensive warranty with claim procedures. Supplier A lacks transparency in these critical areas.","confidence_score":92,"confidence_rationale":"Supplier B provides detailed evidence of commitments and past performance, increasing confidence in their reliability and terms.","ranking":[{"rank":1,"name":"Supplier B — Beta Supply Co. Pvt. Ltd.","summary":"Offers fixed pricing, reliable delivery, detailed cancellation terms, and full liability coverage."},{"rank":2,"name":"Supplier A — Alpha Office Solutions Ltd.","summary":"Lacks commitments on pricing stability, delivery guarantees, and detailed warranty terms."}],"hidden_risks":[{"description":"Price changes in Supplier A's offer without pre-notice.","severity":"High"}],"missing_information":[{"title":"Cancellation Terms for Supplier A","whyItMatters":"Understanding costs and conditions for exits is crucial to manage risks."},{"title":"Warranty Policy for Supplier A","whyItMatters":"Detailed warranty terms are necessary to manage post-purchase risk."}],"evidence_found":[{"section":"PRICING","page":null,"clause":null,"context":"Supplier B provides fixed pricing and has a predictable price increase clause."},{"section":"DELIVERY","page":null,"clause":null,"context":"Supplier B commits to a documented delivery SLA with penalties."}],"decision_defense":"Supplier B's quotation includes fixed pricing for 12 months, delivery guarantees with penalties for delays, and comprehensive warranty terms. This reduces financial and operational risks. Supplier A's lack of these conditions increases uncertainty and risk.","what_would_change":"If Supplier A provides clearer commitments on pricing, delivery, and warranty, including evidence of past performance, the recommendation could be reconsidered.","decision_strength":5,"compared_categories":["Pricing Transparency","Delivery Commitments","Warranty Terms"]}
```
