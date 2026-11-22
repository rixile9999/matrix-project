def titleCase(s: String): String =
  s.split(" ").map(_.capitalize).mkString(" ")
