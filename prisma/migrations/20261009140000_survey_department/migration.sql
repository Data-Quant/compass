-- An anonymous sentiment answer keeps its department only when at least five from that department answered that week.
ALTER TABLE "SurveyResponse" ADD COLUMN "department" TEXT;
