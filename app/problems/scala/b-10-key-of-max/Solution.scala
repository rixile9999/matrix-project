def keyOfMax(m: Map[String, Int]): Option[String] =
  m.maxByOption(_._2).map(_._1)
