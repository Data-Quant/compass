-- Every change from someone with a lead is reviewed by that lead first; HR decides. The lead's note is kept apart from HR's.
ALTER TABLE "PeerChangeRequest" ADD COLUMN "leadNote" TEXT;
