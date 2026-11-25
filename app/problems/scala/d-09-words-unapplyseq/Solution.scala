object Words:
  def unapplySeq(s: String): Option[Seq[String]] =
    Some(s.trim.split("\\s+").toSeq.filter(_.nonEmpty))

object Quoted:
  def unapply(s: String): Boolean =
    s.length >= 2 && s.startsWith("\"") && s.endsWith("\"")
