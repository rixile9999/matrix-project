trait Encoder[A]:
  def encode(a: A): String

given Encoder[Double] with
  def encode(d: Double): String = d.toString

given Encoder[Int] with
  def encode(n: Int): String = n.toString

given Encoder[Boolean] with
  def encode(b: Boolean): String = if b then "true" else "false"

given Encoder[String] with
  def encode(s: String): String =
    val escaped = s.flatMap {
      case '"'  => "\\\""
      case '\\' => "\\\\"
      case '\n' => "\\n"
      case c    => c.toString
    }
    "\"" + escaped + "\""

given [A](using e: Encoder[A]): Encoder[List[A]] with
  def encode(xs: List[A]): String = xs.map(e.encode).mkString("[", ",", "]")

given [A](using e: Encoder[A]): Encoder[Option[A]] with
  def encode(o: Option[A]): String = o.fold("null")(e.encode)

extension [A](a: A)(using e: Encoder[A])
  def toJson: String = e.encode(a)

def jsonObject[A: Encoder](fields: List[(String, A)]): String =
  fields.map((key, value) => s"${key.toJson}:${value.toJson}").mkString("{", ",", "}")
