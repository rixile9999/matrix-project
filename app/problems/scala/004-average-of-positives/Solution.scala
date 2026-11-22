def averageOfPositives(xs: List[Int]): Option[Double] =
  Some(xs.filter(_ > 0)).filter(_.nonEmpty).map(ps => ps.sum.toDouble / ps.size)
