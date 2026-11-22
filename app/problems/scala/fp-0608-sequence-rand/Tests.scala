case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val v = Vector(1, 2, 3, 4)
  Judge.check("sequence: 빈 리스트는 RNG 를 소비하지 않는다")(sequence(scala.List.empty[Rand[Int]])(ScriptRNG(v)), (scala.List.empty[Int], ScriptRNG(v)))
  Judge.check("sequence: 앞에서부터 순서대로")(sequence(scala.List(int, int, int))(ScriptRNG(v)), (scala.List(1, 2, 3), ScriptRNG(v, 3)))
  Judge.check("sequence: unit 과 섞기")(sequence(scala.List(unit(10), int, unit(30), int))(ScriptRNG(v)), (scala.List(10, 1, 30, 2), ScriptRNG(v, 2)))
  Judge.check("randInts: 0개")(randInts(0)(ScriptRNG(v)), (scala.List.empty[Int], ScriptRNG(v)))
  Judge.check("randInts: 3개와 RNG")(randInts(3)(ScriptRNG(v)), (scala.List(1, 2, 3), ScriptRNG(v, 3)))
  val r = SimpleRNG(9)
  val (a, r1) = r.nextInt
  val (b, r2) = r1.nextInt
  Judge.check("randInts: SimpleRNG 와 수동 전개가 일치")(randInts(2)(r), (scala.List(a, b), r2))
