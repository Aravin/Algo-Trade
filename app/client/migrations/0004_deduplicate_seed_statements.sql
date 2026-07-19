-- Deduplicate seed statement entries created by the ensurePaperAccount bug
DELETE FROM paper_statement_entries
WHERE entry_type = 'seed'
  AND id NOT IN (
    SELECT MIN(id)
    FROM paper_statement_entries
    WHERE entry_type = 'seed'
    GROUP BY account_id
  );
