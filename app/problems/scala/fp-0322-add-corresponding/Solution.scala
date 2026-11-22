def addCorresponding(a: List[Int], b: List[Int]): List[Int] = (a, b) match
  case (Cons(h1, t1), Cons(h2, t2)) => Cons(h1 + h2, addCorresponding(t1, t2))
  case _ => Nil
