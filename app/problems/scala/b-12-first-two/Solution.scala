def firstTwo(xs: List[Int]): String = xs match
  case Nil           => "없음"
  case a :: Nil      => s"하나: $a"
  case a :: b :: _   => s"처음 둘: $a, $b"
