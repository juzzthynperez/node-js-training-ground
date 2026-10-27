-- DropIndex
DROP INDEX "loans_book_id_idx";

-- CreateIndex
CREATE INDEX "loans_book_id_returned_at_idx" ON "loans"("book_id", "returned_at");
