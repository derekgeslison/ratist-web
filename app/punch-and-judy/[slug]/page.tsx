import { redirect } from "next/navigation";
interface Props { params: Promise<{ slug: string }> }
export default async function PunchAndJudySlugRedirect({ params }: Props) {
  const { slug } = await params;
  redirect(`/two-thumbs/${slug}`);
}
